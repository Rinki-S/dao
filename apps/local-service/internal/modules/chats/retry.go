package chats

import (
	"errors"
	"net/http"

	"github.com/rinki-s/dao/apps/local-service/internal/ai/llm"
	"github.com/rinki-s/dao/apps/local-service/internal/httpx"
)

// retry asks the model again for a turn that failed, in place.
//
// In place is the whole design. Sending the same question a second time works
// — the words are handed back to the composer when a send is refused — but it
// leaves the transcript holding the question twice and a dead turn between the
// two copies. A retry replaces the turn that failed, so what a conversation
// records is what was asked and what eventually came back, rather than a log
// of the provider's bad afternoon.
//
// Only the last turn, and only a failed one. A retry in the middle of a
// conversation would be asking the model to answer a question it has since
// been told the answer to, and everything after it would still be replying to
// the turn that got replaced.
func (h *Handler) retry(w http.ResponseWriter, r *http.Request) {
	conversationID := r.PathValue("id")
	messageID := r.PathValue("messageId")

	// Everything that can refuse is checked before the response is opened, for
	// the same reason it is on the send path: once the first event is out the
	// status line has gone and a failure can only be reported inside a stream.
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

	conversation, err := h.repo.GetConversation(conversationID)
	if err != nil {
		httpx.Error(w, statusFor(err), messageFor(err, "failed to read the conversation"))
		return
	}

	messages, err := h.repo.Messages(conversationID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to read the conversation")
		return
	}

	if len(messages) == 0 || messages[len(messages)-1].ID != messageID {
		// Either it is not there, or it is not the end of the conversation.
		// Both are the same answer to the caller: this is not a turn that can
		// be tried again.
		httpx.Error(w, http.StatusConflict, "only the last reply can be tried again")
		return
	}

	failed := messages[len(messages)-1]
	if failed.Role != RoleAssistant || failed.Status != StatusFailed {
		// A reply that arrived is not retried, and neither is one somebody
		// stopped on purpose — asking again for a turn they ended would be
		// answering a decision with its opposite.
		httpx.Error(w, http.StatusConflict, "that reply did not fail")
		return
	}

	// The history is everything before the turn being replaced. The failed row
	// itself is left out rather than sent: it holds whatever arrived before it
	// broke, and handing the model half of its own last answer would have it
	// carry on from a sentence it never finished.
	history := messages[:len(messages)-1]

	// What the turn has spent, not counting the attempt being thrown away. A
	// run that died on its first step should not have that step charged
	// against the ceiling twice.
	spent := 0
	for index := len(history) - 1; index >= 0; index-- {
		if history[index].Role == RoleUser {
			break
		}
		spent += history[index].Steps
	}

	wire, model := h.describe()

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.WriteHeader(http.StatusOK)

	// The same row, so the client puts the new reply where the failed one was.
	// No user message: nobody said anything, they asked for another go.
	writeEvent(w, flusher, EventStart, StartEvent{AssistantMessageID: failed.ID})

	h.runTurn(w, r, flusher, turnRun{
		client:       client,
		conversation: conversation,
		assistant:    failed,
		history:      history,
		wire:         wire,
		model:        model,
		spent:        spent,
	})
}
