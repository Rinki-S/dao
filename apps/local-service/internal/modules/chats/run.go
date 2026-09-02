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
)

// turnRun is one run of the loop into an assistant row that already exists.
//
// Shared by the two ways a run starts — somebody said something, or somebody
// answered a proposed change — because the two differ only in what came before.
// Everything after the model is asked is the same thing, and it is the part
// with all the ways to get it wrong: what to keep when a stream dies, what to
// call a reader who pressed stop, what to store so the client and a reload
// agree.
type turnRun struct {
	client       llm.Client
	conversation Conversation
	assistant    Message
	history      []Message
	wire         string
	model        string

	// spent is what this turn has already cost, across every run of it. Zero
	// for a turn that is only just starting.
	spent int
}

// runTurn drives one run to a stored turn and streams it, ending on done.
func (h *Handler) runTurn(w http.ResponseWriter, r *http.Request, flusher http.Flusher, run turnRun) {
	var reply strings.Builder
	var used []ToolCall

	var tools []agent.Tool
	if h.newTools != nil {
		tools = h.newTools(run.conversation.WorkspaceID, run.conversation.ID)
	}

	loop := &agent.Loop{
		Client: run.client,
		Tools:  tools,
		// What is left of the turn's allowance rather than a fresh bound. A
		// continuation that got the full eight again would make the bound
		// meaningless the moment a turn could be picked up.
		MaxSteps: maxTurnSteps - run.spent,
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
			// The result is filled in below when there is one — and for a tool
			// that stops to ask somebody, there is no result to fill in, so it
			// stays pending until they answer.
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

	result, runErr := loop.Run(
		r.Context(), BuildContext(run.history), llm.Options{MaxTokens: chatMaxTokens},
	)

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
		Model:        run.model,
		Wire:         run.wire,
		InputTokens:  result.Usage.InputTokens,
		OutputTokens: result.Usage.OutputTokens,
		Status:       StatusOK,
		ToolCalls:    used,
		Steps:        result.Steps,
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
	case result.Suspended:
		// Not an ending. The model prepared a change and is waiting on a
		// person, and the turn is expected to carry on from here — so the row
		// is ok, and what says the conversation is stopped is the pending call
		// it holds rather than a status invented for it.
	case result.StepsExhausted:
		// Not a broken reply — the model was still looking things up when it
		// ran out of rope. Marked failed because whatever it had said by then
		// is not the answer to the question, and presenting it as one would be
		// the transcript's own claim rather than the model's.
		finished.Status = StatusFailed
		finished.ErrorMessage = fmt.Sprintf(
			"the model was still looking things up after %d steps and was stopped",
			run.spent+result.Steps,
		)
	}

	stored, err := h.repo.Finish(run.assistant.ID, finished)
	if err != nil {
		// The reply happened even if recording it did not. The client is told
		// what arrived and that it was not kept, rather than being left holding
		// text the next reload will contradict.
		stored = run.assistant
		stored.Content = text
		stored.Status = StatusFailed
		stored.ErrorMessage = "the reply could not be saved"
	}

	// Sent before done, so that by the time the client has the turn it also has
	// the change that turn is waiting on. Read back from where it was recorded
	// rather than assembled here: what the reader is shown has to be the row
	// that will be applied, not a second description of it.
	if result.Suspended && h.proposals != nil {
		if waiting, found, err := h.proposals.Waiting(run.conversation.ID); err == nil && found {
			writeEvent(w, flusher, EventProposal, waiting)
		}
	}

	writeEvent(w, flusher, EventDone, stored)
}
