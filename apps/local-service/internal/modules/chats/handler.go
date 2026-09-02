package chats

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/rinki-s/dao/apps/local-service/internal/ai/agent"
	"github.com/rinki-s/dao/apps/local-service/internal/ai/llm"
	"github.com/rinki-s/dao/apps/local-service/internal/httpx"
	"github.com/rinki-s/dao/apps/local-service/internal/modules/proposals"
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
	//
	// The conversation is passed as well as the workspace because a tool that
	// prepares a change has to record it somewhere findable, and where a change
	// waits is in the conversation that asked for it.
	newTools func(workspaceID string, conversationID string) []agent.Tool

	// proposals is where changes wait, and applyChange is what performs one.
	//
	// Split in two on purpose. Reading and resolving a proposal is bookkeeping
	// this module can do; writing to somebody's note is the notes module's
	// business, and chat is handed the ability to ask rather than the tables to
	// do it with. The function returns what the model should be told, because
	// the only true account of what happened is the one from the code that made
	// it happen.
	proposals   *proposals.Repository
	applyChange func(proposals.Proposal) (string, error)
}

// maxTurnSteps bounds a whole turn, however many times it is picked up again.
//
// A turn used to be one run, and the loop's own bound was the whole story. A
// turn can now stop for a person and carry on, and each continuation is a fresh
// run that would otherwise be handed the full bound again — so propose, apply,
// propose, apply is a loop with no end that costs money on every lap.
//
// Sixteen is two full runs' worth. Not a measured number: it is the point past
// which a single question has stopped being a single question, and the person
// who asked it can always ask again.
const maxTurnSteps = 16

func NewHandler(
	repo *Repository,
	newClient func() (llm.Client, error),
	describe func() (wire string, model string),
) *Handler {
	return &Handler{repo: repo, newClient: newClient, describe: describe}
}

// WithTools gives the model something to look things up with.
func (h *Handler) WithTools(
	newTools func(workspaceID string, conversationID string) []agent.Tool,
) *Handler {
	h.newTools = newTools

	return h
}

// WithProposals lets a turn stop for a person and carry on afterwards.
//
// Without it the model can still be offered writing tools by whoever builds
// them, but nothing here would know how to answer one — so the sensible build
// is to wire both or neither, and the tools package already refuses to offer a
// writing tool to a workspace with nowhere to record a proposal.
func (h *Handler) WithProposals(
	repo *proposals.Repository, apply func(proposals.Proposal) (string, error),
) *Handler {
	h.proposals = repo
	h.applyChange = apply

	return h
}

func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/chats", h.list)
	mux.HandleFunc("POST /api/chats", h.create)
	mux.HandleFunc("GET /api/chats/{id}", h.detail)
	mux.HandleFunc("PATCH /api/chats/{id}", h.rename)
	mux.HandleFunc("DELETE /api/chats/{id}", h.delete)
	mux.HandleFunc("POST /api/chats/{id}/messages", h.send)
	mux.HandleFunc("POST /api/chats/{id}/proposals/{proposalId}", h.resolve)
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

	// Saying something else instead of answering is an answer: no.
	//
	// Not tidying-up. A tool call with no result is one the transcript cannot
	// be read back with, so leaving it would make this very turn fail on the
	// wire over a decision the person declined to make. Abandoning it is what
	// lets them just carry on talking, which is the thing they were trying to
	// do — and the model is told plainly that nothing was written, so it does
	// not go on believing the change happened.
	if err := h.abandonWaitingChange(conversationID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to set aside the proposed change")
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

	h.runTurn(w, r, flusher, turnRun{
		client:       client,
		conversation: conversation,
		assistant:    assistant,
		history:      history,
		wire:         wire,
		model:        model,
	})
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
