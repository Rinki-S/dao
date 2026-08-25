package ai

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/rinki-s/dao/apps/local-service/internal/ai/harness"
	"github.com/rinki-s/dao/apps/local-service/internal/ai/llm"
	"github.com/rinki-s/dao/apps/local-service/internal/ai/trace"
	"github.com/rinki-s/dao/apps/local-service/internal/httpx"
)

// Handler owns the API key for the life of the process. It was handed over at
// startup and is never written down, never logged, and never put in a
// response — the renderer can learn that a key exists and nothing more.
type Handler struct {
	repo   *Repository
	apiKey string
	runner *harness.Runner
	traces *trace.Repository
	notes  harness.NoteWriter
}

func NewHandler(repo *Repository, apiKey string) *Handler {
	return &Handler{repo: repo, apiKey: apiKey}
}

// WithHarness attaches the run machinery. It is set after construction because
// the runner needs Client and Describe, which are methods on the handler.
func (h *Handler) WithHarness(
	gather *harness.Gatherer,
	traces *trace.Repository,
	notes harness.NoteWriter,
) *Handler {
	h.traces = traces
	h.notes = notes
	h.runner = &harness.Runner{
		Gather:    gather,
		Traces:    traces,
		NewClient: h.Client,
		Describe:  h.Describe,
		Now:       time.Now,
	}

	return h
}

func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/ai/provider", h.getProvider)
	mux.HandleFunc("PUT /api/ai/provider", h.updateProvider)
	mux.HandleFunc("POST /api/ai/summarize-today", h.summarizeToday)
	mux.HandleFunc("GET /api/ai/traces", h.listTraces)
	mux.HandleFunc("POST /api/ai/traces/{id}/save-as-note", h.saveAsNote)
}

// Describe reports where requests go, for the trace to record alongside them.
func (h *Handler) Describe() (string, string) {
	settings, err := h.repo.Get(h.apiKey != "")
	if err != nil {
		return "", ""
	}

	return settings.Wire, settings.Model
}

func (h *Handler) summarizeToday(w http.ResponseWriter, r *http.Request) {
	workspaceID := r.URL.Query().Get("workspaceId")
	if workspaceID == "" {
		httpx.Error(w, http.StatusBadRequest, "workspaceId is required")
		return
	}
	if h.runner == nil {
		httpx.Error(w, http.StatusServiceUnavailable, "AI is not available")
		return
	}

	result, err := h.runner.SummarizeToday(r.Context(), workspaceID)
	if err != nil {
		httpx.Error(w, summaryStatus(err), summaryMessage(err))
		return
	}

	httpx.JSON(w, http.StatusOK, result)
}

// The status separates what the user can fix from what they cannot.
func summaryStatus(err error) int {
	var apiError *llm.APIError

	switch {
	case errors.Is(err, harness.ErrNothingToday):
		// Not an error the user made, and not a failure of the service.
		return http.StatusNoContent
	case errors.Is(err, llm.ErrNotConfigured):
		return http.StatusPreconditionRequired
	case errors.As(err, &apiError):
		// Pass the provider's own verdict through: an unusable key, a rate
		// limit and a rejected request are three different things to do next.
		return apiError.StatusCode
	default:
		return http.StatusBadGateway
	}
}

func summaryMessage(err error) string {
	var apiError *llm.APIError

	if errors.As(err, &apiError) {
		switch apiError.StatusCode {
		case http.StatusUnauthorized, http.StatusForbidden:
			return "The provider rejected the API key"
		case http.StatusTooManyRequests:
			return "The provider is rate limiting; try again shortly"
		}
	}

	return err.Error()
}

// saveAsNote is the confirmation step: a human saw the summary and chose to
// keep it.
//
// The request carries only the run's id. Everything written comes from the
// trace, so the note is provably the summary that was shown rather than
// something the renderer reassembled — a confirmation that trusts its own
// payload confirms nothing.
func (h *Handler) saveAsNote(w http.ResponseWriter, r *http.Request) {
	if h.runner == nil || h.notes == nil {
		httpx.Error(w, http.StatusServiceUnavailable, "AI is not available")
		return
	}

	accepted, err := h.runner.SaveSummaryAsNote(r.PathValue("id"), h.notes)
	if err != nil {
		switch {
		case errors.Is(err, harness.ErrTraceNotFound):
			httpx.Error(w, http.StatusNotFound, "no such run")
		case errors.Is(err, harness.ErrAlreadyAccepted):
			httpx.Error(w, http.StatusConflict, "that run was already saved")
		case errors.Is(err, harness.ErrNothingToSave):
			httpx.Error(w, http.StatusUnprocessableEntity, "that run produced nothing to save")
		default:
			httpx.Error(w, http.StatusInternalServerError, "failed to save the summary")
		}
		return
	}

	httpx.JSON(w, http.StatusOK, accepted)
}

func (h *Handler) listTraces(w http.ResponseWriter, r *http.Request) {
	workspaceID := r.URL.Query().Get("workspaceId")
	if workspaceID == "" {
		httpx.Error(w, http.StatusBadRequest, "workspaceId is required")
		return
	}

	traces, err := h.traces.List(workspaceID, 50)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to read traces")
		return
	}

	httpx.JSON(w, http.StatusOK, traces)
}

// Client builds a model client from the current settings. It is a factory
// rather than a stored client because settings change while the process runs,
// and because handing the harness a factory is what lets a test hand it a fake.
func (h *Handler) Client() (llm.Client, error) {
	config, err := h.repo.Config(h.apiKey)
	if err != nil {
		return nil, err
	}

	return llm.New(config, nil)
}

func (h *Handler) getProvider(w http.ResponseWriter, _ *http.Request) {
	settings, err := h.repo.Get(h.apiKey != "")
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to read provider settings")
		return
	}

	httpx.JSON(w, http.StatusOK, settings)
}

func (h *Handler) updateProvider(w http.ResponseWriter, r *http.Request) {
	var request UpdateProviderSettingsRequest

	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	settings, err := h.repo.Set(request, h.apiKey != "")
	if err != nil {
		if errors.Is(err, ErrInvalidProviderSettings) {
			httpx.Error(w, http.StatusBadRequest, err.Error())
			return
		}

		httpx.Error(w, http.StatusInternalServerError, "failed to save provider settings")
		return
	}

	httpx.JSON(w, http.StatusOK, settings)
}
