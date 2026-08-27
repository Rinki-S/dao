package chats

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/rinki-s/dao/apps/local-service/internal/ai/llm"
	"github.com/rinki-s/dao/apps/local-service/internal/httpx"
)

// Handler serves conversations and runs a turn.
//
// It reaches the model through two functions rather than through the ai module.
// What chat needs is a client and a description of where requests go; both
// happen to be methods on the ai handler today, but a dependency spelled as an
// import would tie one feature module to another, and the provider settings
// would then be something chat knows about rather than something it is handed.
type Handler struct {
	repo      *Repository
	newClient func() (llm.Client, error)
	describe  func() (wire string, model string)
}

func NewHandler(
	repo *Repository,
	newClient func() (llm.Client, error),
	describe func() (wire string, model string),
) *Handler {
	return &Handler{repo: repo, newClient: newClient, describe: describe}
}

func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/chats", h.list)
	mux.HandleFunc("POST /api/chats", h.create)
	mux.HandleFunc("GET /api/chats/{id}", h.detail)
	mux.HandleFunc("PATCH /api/chats/{id}", h.rename)
	mux.HandleFunc("DELETE /api/chats/{id}", h.delete)
	mux.HandleFunc("POST /api/chats/{id}/messages", h.send)
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	workspaceID := r.URL.Query().Get("workspaceId")
	if workspaceID == "" {
		httpx.Error(w, http.StatusBadRequest, "workspaceId is required")
		return
	}

	conversations, err := h.repo.ListConversations(workspaceID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to read conversations")
		return
	}

	httpx.JSON(w, http.StatusOK, conversations)
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	var request CreateConversationRequest

	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	conversation, err := h.repo.CreateConversation(request)
	if err != nil {
		httpx.Error(w, statusFor(err), messageFor(err, "failed to create the conversation"))
		return
	}

	httpx.JSON(w, http.StatusCreated, conversation)
}

func (h *Handler) detail(w http.ResponseWriter, r *http.Request) {
	detail, err := h.repo.Detail(r.PathValue("id"))
	if err != nil {
		httpx.Error(w, statusFor(err), messageFor(err, "failed to read the conversation"))
		return
	}

	httpx.JSON(w, http.StatusOK, detail)
}

func (h *Handler) rename(w http.ResponseWriter, r *http.Request) {
	var request RenameConversationRequest

	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	conversation, err := h.repo.Rename(r.PathValue("id"), request.Title)
	if err != nil {
		httpx.Error(w, statusFor(err), messageFor(err, "failed to rename the conversation"))
		return
	}

	httpx.JSON(w, http.StatusOK, conversation)
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	if err := h.repo.Delete(r.PathValue("id")); err != nil {
		httpx.Error(w, statusFor(err), messageFor(err, "failed to delete the conversation"))
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// send runs one turn and streams the reply.
//
// The order of the first half matters more than it looks. Everything that can
// refuse the request — a malformed body, an empty message, a provider that is
// not configured, a connection that cannot be streamed to — is checked before
// anything is written, to the transcript or to the response. Once the first
// event is out the status line is already sent and a failure can only be
// reported inside the stream; and a user turn stored for a request that then
// turned out to be unanswerable would leave a question in the transcript that
// nothing was ever going to answer.
func (h *Handler) send(w http.ResponseWriter, r *http.Request) {
	var request SendMessageRequest

	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	content := strings.TrimSpace(request.Content)
	if content == "" {
		httpx.Error(w, http.StatusBadRequest, "message content is required")
		return
	}

	// Server-sent events are useless through a writer that buffers until the
	// handler returns, which is what an unflushable one does.
	flusher, ok := w.(http.Flusher)
	if !ok {
		httpx.Error(w, http.StatusInternalServerError, "this connection cannot stream")
		return
	}

	client, err := h.newClient()
	if err != nil {
		if errors.Is(err, llm.ErrNotConfigured) {
			httpx.Error(w, http.StatusPreconditionRequired, "no model provider is configured")
			return
		}

		httpx.Error(w, http.StatusBadGateway, err.Error())
		return
	}

	conversationID := r.PathValue("id")

	user, err := h.repo.Append(conversationID, Message{Role: RoleUser, Content: content})
	if err != nil {
		httpx.Error(w, statusFor(err), messageFor(err, "failed to store the message"))
		return
	}

	// Read after storing the user's turn and before writing the assistant's, so
	// the history is the conversation as it stands: the question included, the
	// blank waiting to hold the answer not yet there.
	history, err := h.repo.Messages(conversationID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to read the conversation")
		return
	}

	wire, model := h.describe()

	// Written failed, not ok. The row exists before the answer does, so its
	// status has to describe the world at the moment it is written — and a turn
	// that never gets filled in, because the process died or the machine slept,
	// is a turn that failed. Finish flips it when there is a reason to.
	assistant, err := h.repo.Append(conversationID, Message{
		Role:         RoleAssistant,
		Model:        model,
		Wire:         wire,
		Status:       StatusFailed,
		ErrorMessage: "the reply never finished",
	})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to store the reply")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.WriteHeader(http.StatusOK)

	writeEvent(w, flusher, EventStart, StartEvent{
		UserMessage:        user,
		AssistantMessageID: assistant.ID,
	})

	var reply strings.Builder

	response, streamErr := llm.StreamOrComplete(
		r.Context(),
		client,
		BuildContext(history),
		llm.Options{MaxTokens: chatMaxTokens},
		func(chunk string) error {
			// The context, not the write, is what reports a browser that has
			// gone away: a write to a closed connection is buffered by the
			// kernel and succeeds for some time after there is nobody there.
			// Returning an error here is what stops work nobody is waiting for.
			if err := r.Context().Err(); err != nil {
				return err
			}

			reply.WriteString(chunk)

			return writeEvent(w, flusher, EventDelta, DeltaEvent{Text: chunk})
		},
	)

	// The deltas are the answer; the response is the accounting. They are only
	// read the other way round when a call that succeeded reported no deltas at
	// all, which an endpoint claiming to be OpenAI-compatible is entirely
	// capable of doing. Not after a failure: a response can carry more than the
	// caller was actually handed, and storing that as the reply would record an
	// answer the user never saw.
	text := reply.String()
	if text == "" && streamErr == nil {
		text = response.Text()
	}

	finished := Message{
		Content:      text,
		Model:        model,
		Wire:         wire,
		InputTokens:  response.Usage.InputTokens,
		OutputTokens: response.Usage.OutputTokens,
		Status:       StatusOK,
	}
	if streamErr != nil {
		finished.Status = StatusFailed
		finished.ErrorMessage = streamErr.Error()
	}

	stored, err := h.repo.Finish(assistant.ID, finished)
	if err != nil {
		// The reply happened even if recording it did not. The client is told
		// what arrived and that it was not kept, rather than being left holding
		// text the next reload will contradict.
		stored = assistant
		stored.Content = text
		stored.Status = StatusFailed
		stored.ErrorMessage = "the reply could not be saved"
	}

	writeEvent(w, flusher, EventDone, stored)
}

// writeEvent sends one server-sent event.
//
// The payload is JSON on a single line, which is not a formatting preference:
// a newline inside data would be read as the end of the event. json.Marshal
// escapes the newlines in a model's reply, so the framing holds for free.
func writeEvent(w http.ResponseWriter, flusher http.Flusher, event string, payload any) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	if _, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, data); err != nil {
		return err
	}

	flusher.Flush()

	return nil
}

func statusFor(err error) int {
	switch {
	case errors.Is(err, ErrConversationNotFound), errors.Is(err, ErrMessageNotFound):
		return http.StatusNotFound
	case errors.Is(err, ErrInvalidRequest):
		return http.StatusBadRequest
	default:
		return http.StatusInternalServerError
	}
}

// messageFor passes the repository's own words through when they describe
// something the caller can fix, and substitutes a general one when they do not
// — an internal failure's text is for the log, not for a person.
func messageFor(err error, fallback string) string {
	if errors.Is(err, ErrConversationNotFound) ||
		errors.Is(err, ErrMessageNotFound) ||
		errors.Is(err, ErrInvalidRequest) {
		return err.Error()
	}

	return fallback
}
