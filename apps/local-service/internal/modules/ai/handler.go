package ai

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/rinki-s/dao/apps/local-service/internal/ai/llm"
	"github.com/rinki-s/dao/apps/local-service/internal/httpx"
)

// Handler owns the API key for the life of the process. It was handed over at
// startup and is never written down, never logged, and never put in a
// response — the renderer can learn that a key exists and nothing more.
type Handler struct {
	repo   *Repository
	apiKey string
}

func NewHandler(repo *Repository, apiKey string) *Handler {
	return &Handler{repo: repo, apiKey: apiKey}
}

func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/ai/provider", h.getProvider)
	mux.HandleFunc("PUT /api/ai/provider", h.updateProvider)
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
