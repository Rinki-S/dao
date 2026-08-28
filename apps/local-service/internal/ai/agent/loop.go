package agent

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/rinki-s/dao/apps/local-service/internal/ai/llm"
)

// defaultMaxSteps bounds one answer.
//
// Not a safety margin around a number anybody measured — a model that has asked
// for eight rounds of tools on a question about someone's own notes is lost, and
// the ninth will not find it. The bound exists because the failure it prevents
// is unbounded: nothing in the protocol stops a model asking for the same tool
// forever, and every round costs the user money.
const defaultMaxSteps = 8

// Loop asks a model, runs what it asks for, and asks again.
//
// The whole idea of an agent is in those three clauses. What makes it work is
// that the model never runs anything itself: it says what it wants, this code
// decides whether that is a thing that exists and runs it, and the result goes
// back as ordinary content. The model's reach is exactly the set of tools it
// was handed and nothing else.
type Loop struct {
	Client llm.Client
	Tools  []Tool

	// MaxSteps bounds the rounds. Zero means defaultMaxSteps.
	MaxSteps int

	// OnText receives the model's prose as it arrives, across every step. A
	// model that says "let me look at that" before calling a tool has said
	// something worth showing while the tool runs.
	OnText func(string) error

	// OnToolStart and OnToolEnd report what is being done, for a surface that
	// wants to say so while it happens. Neither can refuse: a callback that
	// could stop a run would make the display part of the control flow.
	OnToolStart func(name string, input json.RawMessage)
	OnToolEnd   func(name string, output string, failed bool)
}

// Result is what a whole answer came to.
type Result struct {
	// Text is the model's prose across every step, in order — which is what
	// the reader was shown, so it is what should be stored.
	Text string

	// Steps is how many times the model was asked.
	Steps int

	// StepsExhausted means the model was still asking for tools when the bound
	// ran out. The answer, if there is one, is whatever it had said by then.
	//
	// Reported rather than papered over with one more toolless call to get a
	// tidy answer. That call would spend the user's money at the exact moment
	// something has already gone wrong, to produce a confident-sounding reply
	// from a model that had not finished looking.
	StepsExhausted bool

	// Usage is summed across steps, because that is what the exchange cost.
	Usage llm.Usage
}

// Run drives the loop to an answer.
func (l *Loop) Run(ctx context.Context, request llm.Context, opts llm.Options) (Result, error) {
	maxSteps := l.MaxSteps
	if maxSteps <= 0 {
		maxSteps = defaultMaxSteps
	}

	tools := byName(l.Tools)
	opts.Tools = Definitions(l.Tools)

	// Copied before appending. The caller's slice is its own — a chat handler
	// holding the transcript it read from the database should not find this
	// run's intermediate turns spliced into it.
	messages := make([]llm.Message, len(request.Messages))
	copy(messages, request.Messages)

	var result Result

	for result.Steps < maxSteps {
		request.Messages = messages
		result.Steps++

		response, err := llm.StreamOrComplete(ctx, l.Client, request, opts, l.text)
		// Usage first: a step that failed part way still spent tokens, and the
		// count should say so even when there is nothing to show for them.
		result.Usage.InputTokens += response.Usage.InputTokens
		result.Usage.OutputTokens += response.Usage.OutputTokens
		if err != nil {
			return result, err
		}

		result.Text += response.Text()

		// Decided by looking for the calls, not by the stop reason. An endpoint
		// can finish with "stop" and hand back tool calls anyway, and a loop
		// keyed on the string would drop them.
		calls := response.ToolCalls()
		if len(calls) == 0 {
			return result, nil
		}

		// The assistant's turn goes back exactly as it came, calls included.
		// The results that follow refer to those calls by id, and a history
		// missing the call has nothing for them to answer.
		messages = append(messages, llm.Message{Role: llm.RoleAssistant, Content: response.Content})

		results, err := l.run(ctx, tools, calls)
		if err != nil {
			return result, err
		}

		messages = append(messages, llm.Message{Role: llm.RoleUser, Content: results})
	}

	result.StepsExhausted = true

	return result, nil
}

func (l *Loop) text(chunk string) error {
	if l.OnText == nil {
		return nil
	}

	return l.OnText(chunk)
}

// run executes one step's calls and returns them as results.
//
// In the order the model asked, one at a time. Running them concurrently would
// be faster and would throw away the only ordering information there is: a
// model that asks to read a file and then search it said those in that order,
// and nothing here knows whether that mattered.
func (l *Loop) run(
	ctx context.Context, tools map[string]Tool, calls []llm.ContentBlock,
) ([]llm.ContentBlock, error) {
	results := make([]llm.ContentBlock, 0, len(calls))

	for _, call := range calls {
		// Checked before each tool rather than only between steps: a run of
		// several slow tools should stop when the reader has gone, not finish
		// the set first.
		if err := ctx.Err(); err != nil {
			return nil, err
		}

		if l.OnToolStart != nil {
			l.OnToolStart(call.Name, call.Input)
		}

		output, failed := l.one(ctx, tools, call)

		// A cancelled context is the caller leaving, not a tool failing. Fed
		// back to the model as a result it would try again, and again, against
		// a connection that is already gone.
		if err := ctx.Err(); err != nil {
			return nil, err
		}

		if l.OnToolEnd != nil {
			l.OnToolEnd(call.Name, output, failed)
		}

		results = append(results, llm.ToolResultBlock(call.ID, output, failed))
	}

	return results, nil
}

// one runs a single call, turning every way it can go wrong into something the
// model can read.
//
// Failures go back as results rather than up as errors because the model is
// what has to do something about them. Told that no note has that name it asks
// for a different one; handed nothing, it writes what the note would have said.
func (l *Loop) one(
	ctx context.Context, tools map[string]Tool, call llm.ContentBlock,
) (string, bool) {
	tool, known := tools[call.Name]
	if !known {
		// It happens: a model will invent a tool that ought to exist. Saying
		// which ones do is more useful than saying no.
		return fmt.Sprintf(
			"No tool named %q. The tools available are: %s.",
			call.Name, names(l.Tools),
		), true
	}

	output, err := tool.Run(ctx, call.Input)
	if err != nil {
		return err.Error(), true
	}

	// An empty result is a result, and one the model has to be told about in
	// words: a search that found nothing reads as a broken tool otherwise, and
	// the model fills the silence.
	if output == "" {
		return "(the tool returned nothing)", false
	}

	return output, false
}

func names(tools []Tool) string {
	list := ""
	for index, tool := range tools {
		if index > 0 {
			list += ", "
		}
		list += tool.Definition().Name
	}
	if list == "" {
		return "none"
	}

	return list
}
