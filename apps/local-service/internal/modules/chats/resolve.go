package chats

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/rinki-s/dao/apps/local-service/internal/ai/llm"
	"github.com/rinki-s/dao/apps/local-service/internal/httpx"
	"github.com/rinki-s/dao/apps/local-service/internal/modules/proposals"
)

// What somebody can say about a change the model prepared.
const (
	DecisionApply   = "apply"
	DecisionDiscard = "discard"
)

// ResolveProposalRequest is a person's answer.
//
// The decision and nothing else. Deliberately not the change: what gets written
// is read from the row that was shown, so there is nothing here for a caller to
// substitute. A confirmation that carried its own payload would be confirming
// whatever the last request said rather than what the person read.
type ResolveProposalRequest struct {
	Decision string `json:"decision"`
}

// resolve answers a proposed change and carries the conversation on.
//
// It streams, like sending a message does, and for the same reason: what
// happens next is the model being asked again, and the reply arrives a word at
// a time. The decision is the whole of the request; the change comes from the
// stored row.
func (h *Handler) resolve(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		httpx.Error(w, http.StatusInternalServerError, "streaming is not supported here")
		return
	}

	if h.proposals == nil || h.applyChange == nil {
		httpx.Error(w, http.StatusNotImplemented, "this build cannot apply changes")
		return
	}

	conversationID := strings.TrimSpace(r.PathValue("id"))
	proposalID := strings.TrimSpace(r.PathValue("proposalId"))
	if conversationID == "" || proposalID == "" {
		httpx.Error(w, http.StatusBadRequest, "a conversation and a change are required")
		return
	}

	var request ResolveProposalRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if request.Decision != DecisionApply && request.Decision != DecisionDiscard {
		httpx.Error(w, http.StatusBadRequest, `decision must be "apply" or "discard"`)
		return
	}

	conversation, err := h.repo.GetConversation(conversationID)
	if err != nil {
		httpx.Error(w, statusFor(err), messageFor(err, "failed to read the conversation"))
		return
	}

	proposal, err := h.proposals.Get(proposalID)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "no such change")
		return
	}

	// The change has to belong to the conversation in the path. Without this an
	// id is enough to apply a change prepared in a conversation about something
	// else entirely, which is not a thing the person answering ever saw.
	if proposal.ConversationID != conversationID {
		httpx.Error(w, http.StatusNotFound, "no such change in this conversation")
		return
	}
	if !proposal.Pending() {
		httpx.Error(w, http.StatusConflict, "that change was already answered")
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

	// Done before the stream opens, so that a change that cannot be applied is
	// an ordinary HTTP failure the caller can show, rather than a surprise
	// inside a stream that has already promised to end with a reply.
	outcome, failed := h.perform(proposal, request.Decision)

	recorded, err := h.proposals.Resolve(proposalID, statusAfter(request.Decision, failed), outcome)
	if err != nil {
		if errors.Is(err, proposals.ErrAlreadyResolved) {
			httpx.Error(w, http.StatusConflict, "that change was already answered")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to record the decision")
		return
	}

	// The call the model was left waiting on now has an answer, which is what
	// puts the transcript back together. Until this runs, BuildContext refuses
	// to send that turn's call at all, and the model would be handed a
	// conversation with a hole where its own request used to be.
	answered, err := h.repo.AnswerToolCall(conversationID, proposal.ToolCallID, outcome, failed)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to record what happened")
		return
	}
	if !answered {
		// The change was answered but the turn it belonged to cannot be found,
		// so there is nothing to carry on from. Said plainly rather than
		// starting a run against a transcript with a hole in it.
		httpx.Error(w, http.StatusConflict, "the turn that proposed this change is no longer there")
		return
	}

	spent, err := h.repo.StepsSinceLastUserTurn(conversationID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to read the conversation")
		return
	}

	history, err := h.repo.Messages(conversationID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to read the conversation")
		return
	}

	wire, model := h.describe()

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

	// No user message: nobody said anything. The start event still carries the
	// assistant's id, which is what the client needs somewhere to put the
	// deltas that follow.
	writeEvent(w, flusher, EventStart, StartEvent{AssistantMessageID: assistant.ID})

	// What the change is now, from the row that was just written. The caller
	// knows which decision it sent, but not what came of acting on it — an apply
	// the note refused is recorded as failed, and a surface left to infer the
	// status from the decision it sent would show the change as made.
	writeEvent(w, flusher, EventProposal, recorded)

	// The turn has spent its allowance. Recorded as the turn ending rather than
	// asking the model again, which is the whole point of having a ceiling.
	if spent >= maxTurnSteps {
		stored, storeErr := h.repo.Finish(assistant.ID, Message{
			Model: model,
			Wire:  wire,
			Content: "This turn has gone on long enough and was stopped. " +
				"The change was answered; ask again if there is more to do.",
			Status: StatusFailed,
			ErrorMessage: fmt.Sprintf(
				"the turn reached its limit of %d steps", maxTurnSteps,
			),
		})
		if storeErr != nil {
			stored = assistant
		}

		writeEvent(w, flusher, EventDone, stored)

		return
	}

	h.runTurn(w, r, flusher, turnRun{
		client:       client,
		conversation: conversation,
		assistant:    assistant,
		history:      history,
		wire:         wire,
		model:        model,
		spent:        spent,
	})
}

// perform carries out a decision and says what the model should be told.
//
// The account of what happened comes from the code that made it happen. A
// message written here from what was intended would say the change was applied
// whether or not it was, which is the one thing the model must not be told
// wrongly — it will go on to describe the workspace as though it were true.
func (h *Handler) perform(proposal proposals.Proposal, decision string) (string, bool) {
	if decision == DecisionDiscard {
		// Not a failure for the model to work around. It asked, the answer was
		// no, and that is a complete and correct outcome — reported as an error
		// it would try a different wording of the same change.
		return "The person declined this change. Nothing was written. " +
			"Do not try it again unless they ask.", false
	}

	outcome, err := h.applyChange(proposal)
	if err != nil {
		return fmt.Sprintf("The change could not be applied: %v", err), true
	}

	return outcome, false
}

// statusAfter turns a decision, and what came of acting on it, into the status
// it leaves behind.
//
// Both arguments, because the decision alone is what the person said and the
// row is meant to record what happened. An apply the note refused is not an
// apply: perform already knows, because it is the code that tried, and taking
// the status from the decision would throw that away and leave the row claiming
// a change the file does not contain.
func statusAfter(decision string, failed bool) string {
	if decision != DecisionApply {
		return proposals.StatusDiscarded
	}

	if failed {
		return proposals.StatusFailed
	}

	return proposals.StatusApplied
}

// abandonWaitingChange is what happens when somebody says something else
// instead of answering.
//
// Returns what it set aside, so the stream that follows can say so. The change
// is on screen with its buttons live at the moment this runs, and a card left
// offering a decision that has already been spent is one press away from an
// answer the service will refuse.
func (h *Handler) abandonWaitingChange(conversationID string) (proposals.Proposal, bool, error) {
	if h.proposals == nil {
		return proposals.Proposal{}, false, nil
	}

	const outcome = "The person moved on without answering this change. " +
		"Nothing was written. Do not assume it was applied."

	abandoned, found, err := h.proposals.DiscardWaiting(conversationID, outcome)
	if err != nil || !found {
		return proposals.Proposal{}, false, err
	}

	// The waiting call is answered too, or the transcript stays unreadable and
	// the message they are about to send fails on the wire.
	if _, err := h.repo.AnswerToolCall(
		conversationID, abandoned.ToolCallID, outcome, false,
	); err != nil {
		return proposals.Proposal{}, false, err
	}

	return abandoned, true, nil
}
