package agent

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/rinki-s/dao/apps/local-service/internal/ai/llm"
	"github.com/rinki-s/dao/apps/local-service/internal/ai/llm/llmtest"
)

// stub is a tool that answers however the test needs it to, and remembers what
// it was asked.
type stub struct {
	name   string
	answer string
	err    error
	inputs []string
	runs   int
}

func (s *stub) Definition() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name:        s.name,
		Description: "a tool, for testing",
		Schema:      json.RawMessage(`{"type":"object"}`),
	}
}

func (s *stub) Run(_ context.Context, input json.RawMessage) (string, error) {
	s.runs++
	s.inputs = append(s.inputs, string(input))

	return s.answer, s.err
}

func run(t *testing.T, loop *Loop) Result {
	t.Helper()

	result, err := loop.Run(
		context.Background(),
		llm.Context{Messages: []llm.Message{llm.UserText("what did I write?")}},
		llm.Options{MaxTokens: 100},
	)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}

	return result
}

func TestTheModelAsksAndTheLoopAnswers(t *testing.T) {
	search := &stub{name: "search_notes", answer: "Parser recovery strategy.md"}
	model := llmtest.Sequence(
		llmtest.Turn{Text: "Let me look. ", Calls: llmtest.ToolCall("call-1", "search_notes", `{"query":"parser"}`).Calls},
		llmtest.Turn{Text: "You wrote about parser recovery.", Stop: llm.StopEnd},
	)

	result := run(t, &Loop{Client: model, Tools: []Tool{search}})

	if search.runs != 1 {
		t.Fatalf("the tool ran %d times, want 1", search.runs)
	}
	if search.inputs[0] != `{"query":"parser"}` {
		t.Errorf("the tool was given %s", search.inputs[0])
	}
	if result.Steps != 2 {
		t.Errorf("took %d steps, want 2", result.Steps)
	}

	// The prose of every step, in order: what the reader was shown is what
	// should be stored.
	if result.Text != "Let me look. You wrote about parser recovery." {
		t.Errorf("text = %q", result.Text)
	}
}

// The second request has to carry the model's own call and the result that
// answers it. Without the call, the result refers to nothing.
func TestTheNextRequestCarriesTheWholeExchange(t *testing.T) {
	search := &stub{name: "search_notes", answer: "one note"}
	model := llmtest.Sequence(
		llmtest.ToolCall("call-1", "search_notes", `{"query":"parser"}`),
		llmtest.Turn{Text: "done", Stop: llm.StopEnd},
	)

	run(t, &Loop{Client: model, Tools: []Tool{search}})

	if len(model.Requests) != 2 {
		t.Fatalf("asked %d times, want 2", len(model.Requests))
	}

	second := model.Requests[1].Messages
	if len(second) != 3 {
		t.Fatalf("second request carried %d messages, want the question, the call and the result", len(second))
	}

	call := second[1]
	if call.Role != llm.RoleAssistant || call.Content[0].Kind != llm.KindToolCall {
		t.Fatalf("message 1 = %+v", call)
	}
	if call.Content[0].ID != "call-1" {
		t.Errorf("the call went back with id %q", call.Content[0].ID)
	}

	answer := second[2]
	if answer.Role != llm.RoleUser || answer.Content[0].Kind != llm.KindToolResult {
		t.Fatalf("message 2 = %+v", answer)
	}
	if answer.Content[0].ID != "call-1" {
		t.Errorf("the result answered %q", answer.Content[0].ID)
	}
	if answer.Content[0].Text != "one note" {
		t.Errorf("the result carried %q", answer.Content[0].Text)
	}
}

// The caller's own slice must come back untouched. A chat handler holding the
// transcript it read from the database should not find a run's intermediate
// turns spliced into it.
func TestTheCallersMessagesAreNotModified(t *testing.T) {
	search := &stub{name: "search_notes", answer: "one note"}
	model := llmtest.Sequence(
		llmtest.ToolCall("call-1", "search_notes", `{}`),
		llmtest.Turn{Text: "done", Stop: llm.StopEnd},
	)

	messages := []llm.Message{llm.UserText("what did I write?")}
	loop := &Loop{Client: model, Tools: []Tool{search}}

	if _, err := loop.Run(
		context.Background(), llm.Context{Messages: messages}, llm.Options{MaxTokens: 10},
	); err != nil {
		t.Fatalf("Run: %v", err)
	}

	if len(messages) != 1 {
		t.Fatalf("the caller's messages grew to %d", len(messages))
	}
}

// A tool that fails is reported to the model, which is the one that can do
// something about it. Raised to the caller instead, the answer would be an
// error page where a model would have asked a better question.
func TestAFailedToolGoesBackToTheModel(t *testing.T) {
	search := &stub{name: "search_notes", err: errors.New("no note by that name")}
	model := llmtest.Sequence(
		llmtest.ToolCall("call-1", "search_notes", `{"query":"nothing"}`),
		llmtest.Turn{Text: "I could not find it.", Stop: llm.StopEnd},
	)

	result := run(t, &Loop{Client: model, Tools: []Tool{search}})

	if result.Text != "I could not find it." {
		t.Errorf("text = %q", result.Text)
	}

	answer := model.Requests[1].Messages[2].Content[0]
	if !answer.IsError {
		t.Error("the failure was not marked as one")
	}
	if answer.Text != "no note by that name" {
		t.Errorf("the model was told %q", answer.Text)
	}
}

// Models invent tools that ought to exist. Saying which ones do is more useful
// than saying no.
func TestAnInventedToolIsAnsweredWithTheRealOnes(t *testing.T) {
	search := &stub{name: "search_notes"}
	model := llmtest.Sequence(
		llmtest.ToolCall("call-1", "delete_everything", `{}`),
		llmtest.Turn{Text: "understood", Stop: llm.StopEnd},
	)

	run(t, &Loop{Client: model, Tools: []Tool{search}})

	if search.runs != 0 {
		t.Fatal("a tool ran for a call that named a different one")
	}

	answer := model.Requests[1].Messages[2].Content[0]
	if !answer.IsError {
		t.Error("the unknown tool was not reported as a failure")
	}
	if !strings.Contains(answer.Text, "search_notes") {
		t.Errorf("the model was not told what does exist: %q", answer.Text)
	}
}

// Nothing in the protocol stops a model asking for the same tool forever, and
// every round costs the user money.
func TestTheLoopIsBounded(t *testing.T) {
	search := &stub{name: "search_notes", answer: "still nothing"}

	// More turns queued than the bound allows, all of them asking again.
	turns := make([]llmtest.Turn, 10)
	for index := range turns {
		turns[index] = llmtest.ToolCall("call", "search_notes", `{}`)
	}

	result := run(t, &Loop{Client: llmtest.Sequence(turns...), Tools: []Tool{search}, MaxSteps: 3})

	if result.Steps != 3 {
		t.Errorf("took %d steps, want the bound of 3", result.Steps)
	}
	if !result.StepsExhausted {
		t.Error("ran out of steps without saying so")
	}
	if search.runs != 3 {
		t.Errorf("the tool ran %d times", search.runs)
	}
}

// Usage is summed rather than taken from the last step, because what the
// exchange cost is every step it took.
func TestUsageIsSummedAcrossSteps(t *testing.T) {
	search := &stub{name: "search_notes", answer: "one note"}
	model := llmtest.Sequence(
		llmtest.Turn{
			Calls: llmtest.ToolCall("call-1", "search_notes", `{}`).Calls,
			Usage: llm.Usage{InputTokens: 100, OutputTokens: 10},
		},
		llmtest.Turn{
			Text:  "done",
			Stop:  llm.StopEnd,
			Usage: llm.Usage{InputTokens: 150, OutputTokens: 20},
		},
	)

	result := run(t, &Loop{Client: model, Tools: []Tool{search}})

	if result.Usage.InputTokens != 250 || result.Usage.OutputTokens != 30 {
		t.Errorf("usage = %+v", result.Usage)
	}
}

// A reader who has gone away stops the work, and does so without the model
// being told a tool failed — told that, it would try again against a
// connection that is already closed.
func TestACancelledRunStopsRatherThanRetrying(t *testing.T) {
	search := &stub{name: "search_notes", answer: "one note"}
	model := llmtest.Sequence(
		llmtest.ToolCall("call-1", "search_notes", `{}`),
		llmtest.Turn{Text: "unreachable", Stop: llm.StopEnd},
	)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	loop := &Loop{Client: model, Tools: []Tool{search}}
	_, err := loop.Run(ctx, llm.Context{Messages: []llm.Message{llm.UserText("hi")}}, llm.Options{})

	if !errors.Is(err, context.Canceled) {
		t.Fatalf("err = %v, want the cancellation", err)
	}
	if search.runs != 0 {
		t.Error("a tool ran for a reader who had gone")
	}
}

// What a surface needs to say "reading your notes" while it happens.
func TestTheLoopReportsWhatItIsDoing(t *testing.T) {
	search := &stub{name: "search_notes", answer: "one note"}
	model := llmtest.Sequence(
		llmtest.Turn{Text: "Let me look. ", Calls: llmtest.ToolCall("call-1", "search_notes", `{"query":"parser"}`).Calls},
		llmtest.Turn{Text: "done", Stop: llm.StopEnd},
	)

	var prose strings.Builder
	var started, ended []string

	run(t, &Loop{
		Client: model,
		Tools:  []Tool{search},
		OnText: func(chunk string) error {
			prose.WriteString(chunk)
			return nil
		},
		OnToolStart: func(id, name string, input json.RawMessage) {
			started = append(started, id+" "+name+" "+string(input))
		},
		OnToolEnd: func(id, name, output string, failed bool) {
			ended = append(ended, id+" "+name+" "+output)
		},
	})

	// Prose streams across every step, so a model narrating what it is about to
	// do reaches the reader while the tool runs rather than after it.
	if prose.String() != "Let me look. done" {
		t.Errorf("streamed %q", prose.String())
	}
	// The id travels with both reports. A surface that only displays has no use
	// for it, but one that stores the exchange cannot pair a result with the
	// call it answers without it.
	if len(started) != 1 || started[0] != `call-1 search_notes {"query":"parser"}` {
		t.Errorf("start reports = %v", started)
	}
	if len(ended) != 1 || ended[0] != "call-1 search_notes one note" {
		t.Errorf("end reports = %v", ended)
	}
}

// A search that found nothing has to say so in words, or the model reads the
// silence as a broken tool and fills it in.
func TestAnEmptyResultIsSaidInWords(t *testing.T) {
	search := &stub{name: "search_notes", answer: ""}
	model := llmtest.Sequence(
		llmtest.ToolCall("call-1", "search_notes", `{}`),
		llmtest.Turn{Text: "Nothing there.", Stop: llm.StopEnd},
	)

	run(t, &Loop{Client: model, Tools: []Tool{search}})

	answer := model.Requests[1].Messages[2].Content[0]
	if answer.Text == "" {
		t.Error("the model was handed an empty result and left to guess")
	}
	if answer.IsError {
		t.Error("finding nothing was reported as a failure")
	}
}

// refusingTools turns the request down while tools are on it, and answers once
// they are gone. Ollama does exactly this for a model with no tool support, and
// most models people run locally have none.
type refusingTools struct {
	answer  string
	refused int
}

func (r *refusingTools) Complete(
	_ context.Context, _ llm.Context, opts llm.Options,
) (llm.Response, error) {
	if len(opts.Tools) > 0 {
		r.refused++

		return llm.Response{}, &llm.APIError{
			StatusCode: 400,
			Body:       `{"error":{"message":"registry.ollama.ai/library/gemma3:12b does not support tools"}}`,
		}
	}

	return llm.Response{
		Content:    []llm.ContentBlock{llm.TextBlock(r.answer)},
		StopReason: llm.StopEnd,
	}, nil
}

// Offering tools must not break plain conversation on an endpoint that will not
// take them — which is the local setup this app goes out of its way to support.
func TestAnEndpointThatRefusesToolsStillAnswers(t *testing.T) {
	model := &refusingTools{answer: "no tools, still an answer"}
	search := &stub{name: "search_notes"}

	result := run(t, &Loop{Client: model, Tools: []Tool{search}})

	if result.Text != "no tools, still an answer" {
		t.Fatalf("text = %q", result.Text)
	}
	if model.refused != 1 {
		t.Errorf("offered tools %d times, want one attempt before giving up on them", model.refused)
	}
}

// The retry is for one refusal, not for every failure. A rejected key or a rate
// limit says something else, and asking again without tools would only hide it.
func TestOtherRefusalsAreNotRetriedWithoutTools(t *testing.T) {
	for _, testCase := range []struct {
		name   string
		status int
		body   string
	}{
		{"a rejected key", 401, "invalid api key"},
		{"a rate limit", 429, "slow down"},
		{"a bad request about something else", 400, "messages: must not be empty"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			model := llmtest.Sequence(llmtest.Turn{
				Err: &llm.APIError{StatusCode: testCase.status, Body: testCase.body},
			})

			loop := &Loop{Client: model, Tools: []Tool{&stub{name: "search_notes"}}}
			_, err := loop.Run(
				context.Background(),
				llm.Context{Messages: []llm.Message{llm.UserText("hi")}},
				llm.Options{},
			)

			if err == nil {
				t.Fatal("the refusal was swallowed")
			}
			// One attempt: a second would have exhausted the queued turn and
			// come back with a different error.
			if model.Calls() != 1 {
				t.Errorf("asked %d times, want 1", model.Calls())
			}
		})
	}
}

// A tool that will not act without a person stops the run rather than reporting
// a failure the model would try to work around.
func TestAToolWaitingOnAPersonStopsTheRun(t *testing.T) {
	edit := &stub{name: "edit_note", err: ErrAwaitingApproval}
	model := llmtest.Sequence(
		llmtest.Turn{
			Text:  "I can change that. ",
			Calls: llmtest.ToolCall("call-1", "edit_note", `{"noteId":"n1"}`).Calls,
		},
		// Never reached. Asking again would spend money on a turn whose answer
		// cannot arrive until somebody has decided.
		llmtest.Turn{Text: "Done.", Stop: llm.StopEnd},
	)

	result := run(t, &Loop{Client: model, Tools: []Tool{edit}})

	if !result.Suspended {
		t.Fatal("the run did not report that it stopped")
	}
	if result.AwaitingCallID != "call-1" {
		t.Errorf("waiting on %q, want call-1", result.AwaitingCallID)
	}
	if result.Steps != 1 {
		t.Errorf("steps = %d, want the model asked once", result.Steps)
	}

	// The prose so far is real and worth showing. Stopping is not failing.
	if result.Text != "I can change that. " {
		t.Errorf("text = %q", result.Text)
	}
}

// Anything asked for after the tool that is waiting is not run: it was asked
// against a workspace that is about to change, and the model can ask again once
// it knows what happened.
func TestNothingAfterTheWaitingToolIsRun(t *testing.T) {
	edit := &stub{name: "edit_note", err: ErrAwaitingApproval}
	search := &stub{name: "search_notes", answer: "a note"}

	calls := llmtest.ToolCall("call-1", "edit_note", `{}`).Calls
	calls = append(calls, llmtest.ToolCall("call-2", "search_notes", `{}`).Calls...)

	model := llmtest.Sequence(
		llmtest.Turn{Calls: calls},
		llmtest.Turn{Text: "Done.", Stop: llm.StopEnd},
	)

	result := run(t, &Loop{Client: model, Tools: []Tool{edit, search}})

	if !result.Suspended || result.AwaitingCallID != "call-1" {
		t.Fatalf("result = %+v", result)
	}
	if search.runs != 0 {
		t.Errorf("a tool behind the waiting one ran %d times", search.runs)
	}
}

// Nothing ended, so nothing is reported as having ended. A surface told the
// call finished would say so, and the only true thing to say is that it is
// waiting.
func TestAWaitingToolIsNotReportedAsFinished(t *testing.T) {
	edit := &stub{name: "edit_note", err: ErrAwaitingApproval}
	model := llmtest.Sequence(
		llmtest.Turn{Calls: llmtest.ToolCall("call-1", "edit_note", `{}`).Calls},
	)

	var started, ended []string

	run(t, &Loop{
		Client: model,
		Tools:  []Tool{edit},
		OnToolStart: func(id, name string, _ json.RawMessage) {
			started = append(started, id)
		},
		OnToolEnd: func(id, name, output string, failed bool) {
			ended = append(ended, id)
		},
	})

	// Announced, because it did start and the reader should see it.
	if len(started) != 1 || started[0] != "call-1" {
		t.Errorf("start reports = %v", started)
	}
	if len(ended) != 0 {
		t.Errorf("a waiting call was reported as finished: %v", ended)
	}
}
