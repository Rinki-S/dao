package chats

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/rinki-s/dao/apps/local-service/internal/ai/agent"
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

	// newTools builds the tools for one workspace. A function of the workspace
	// rather than a fixed set, because a tool's reach is decided when it is
	// built — the model is never given the workspace to name, so the only place
	// that can be got wrong is here.
	//
	// Nil means the model is offered nothing and answers from the conversation
	// alone, which is what a build with no tools wired up should do rather than
	// crash.
	newTools func(workspaceID string) []agent.Tool
}

func NewHandler(
	repo *Repository,
	newClient func() (llm.Client, error),
	describe func() (wire string, model string),
) *Handler {
	return &Handler{repo: repo, newClient: newClient, describe: describe}
}

// WithTools gives the model something to look things up with.
func (h *Handler) WithTools(newTools func(workspaceID string) []agent.Tool) *Handler {
	h.newTools = newTools

	return h
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

	// Read before anything is written, for the workspace. The tools are built
	// around it and the model has no say in which one that is — this line is
	// where a chat's reach is decided.
	conversation, err := h.repo.GetConversation(conversationID)
	if err != nil {
		httpx.Error(w, statusFor(err), messageFor(err, "failed to read the conversation"))
		return
	}

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
	var used []ToolCall

	var tools []agent.Tool
	if h.newTools != nil {
		tools = h.newTools(conversation.WorkspaceID)
	}

	loop := &agent.Loop{
		Client: client,
		Tools:  tools,
		OnText: func(chunk string) error {
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
		OnToolStart: func(id string, name string, input json.RawMessage) {
			// Recorded and announced in the same place, so what the reader was
			// told and what the transcript keeps cannot disagree.
			//
			// Recorded at the start, when there is no result yet, because a run
			// that dies mid-tool should still show what was being attempted.
			// The result is filled in below when there is one.
			used = append(used, ToolCall{
				ID:     id,
				Name:   name,
				Input:  string(input),
				Status: ToolCallPending,
			})
			_ = writeEvent(w, flusher, EventTool, ToolEvent{Name: name, Input: string(input)})
		},
		OnToolEnd: func(id string, _ string, output string, failed bool) {
			// What the model was told. Not shown to the reader — the line
			// announcing the call is what they see — but it is the whole of
			// what the model knows on the next turn, so the transcript is only
			// replayable if it is kept.
			status := ToolCallOK
			if failed {
				status = ToolCallFailed
			}

			for i := range used {
				if used[i].ID == id && used[i].Status == ToolCallPending {
					used[i].Output = output
					used[i].Status = status
					return
				}
			}
		},
	}

	result, runErr := loop.Run(r.Context(), BuildContext(history), llm.Options{MaxTokens: chatMaxTokens})

	// The deltas are the answer; the result's text is the same words gathered by
	// the loop. They are only read the other way round when a call that
	// succeeded reported no deltas at all, which an endpoint claiming to be
	// OpenAI-compatible is entirely capable of doing. Not after a failure: the
	// result can carry more than the caller was actually handed, and storing
	// that as the reply would record an answer the user never saw.
	text := reply.String()
	if text == "" && runErr == nil {
		text = result.Text
	}

	finished := Message{
		Content:      text,
		Model:        model,
		Wire:         wire,
		InputTokens:  result.Usage.InputTokens,
		OutputTokens: result.Usage.OutputTokens,
		Status:       StatusOK,
		ToolCalls:    used,
	}
	switch {
	case errors.Is(runErr, context.Canceled):
		// The reader closed the stream, which in this app means they pressed
		// stop. Nothing went wrong, so nothing is recorded as having gone
		// wrong: the text that arrived is kept and the turn says it was ended
		// rather than that it broke.
		//
		// A dropped connection lands here too and is called the same thing.
		// From this side the two are identical — the reader stopped reading —
		// and guessing which one it was would mean inventing a distinction the
		// service cannot see.
		finished.Status = StatusStopped
	case runErr != nil:
		finished.Status = StatusFailed
		finished.ErrorMessage = runErr.Error()
	case result.StepsExhausted:
		// Not a broken reply — the model was still looking things up when it
		// ran out of rope. Marked failed because whatever it had said by then
		// is not the answer to the question, and presenting it as one would be
		// the transcript's own claim rather than the model's.
		finished.Status = StatusFailed
		finished.ErrorMessage = fmt.Sprintf(
			"the model was still looking things up after %d steps and was stopped", result.Steps,
		)
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
