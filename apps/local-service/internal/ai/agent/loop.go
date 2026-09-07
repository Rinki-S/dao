package agent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/rinki-s/dao/apps/local-service/internal/ai/llm"
)

// ErrAwaitingApproval is a tool saying it has prepared something and will not
// do it without a person.
//
// Returned from Run like any other error, and handled like no other. Every
// other failure goes back to the model as a result it can act on, because the
// model is what has to do something about it. This one the model cannot act on
// at all: there is nothing to try differently and nothing to say that would
// change the answer. The only thing that resolves it is somebody deciding, and
// that happens on a different connection, minutes or days from now.
//
// So the run stops here rather than continuing without the tool. What it was
// stopped on is the tool's own business to have recorded; the loop only reports
// that it stopped and which call it stopped on.
var ErrAwaitingApproval = errors.New("waiting for a person to decide")

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

	// OnReasoning receives a reasoning model's working as it arrives, on its
	// own channel rather than mixed into OnText.
	//
	// Separate because the two are not the same claim. Prose is the model's
	// answer and belongs in the transcript; this is how it got there, and a
	// surface may well decline to show it at all. A caller that does not want
	// it leaves this nil, and nothing else changes — the working is still
	// collected on Result either way, because the next request may need it
	// back.
	OnReasoning func(string) error

	// OnToolStart and OnToolEnd report what is being done, for a surface that
	// wants to say so while it happens. Neither can refuse: a callback that
	// could stop a run would make the display part of the control flow.
	//
	// Both carry the model's id for the call. A surface that only displays has
	// no use for it, but one that stores the exchange does: the id is what
	// pairs a result with the call it answers, and a transcript that has lost
	// that pairing cannot be read back to a model at all.
	OnToolStart func(id string, name string, input json.RawMessage)
	OnToolEnd   func(id string, name string, output string, failed bool)
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

	// Suspended means a tool prepared something and is waiting for a person.
	//
	// Not a failure and not an ending. The answer so far is real and worth
	// showing, and the conversation is expected to carry on from here once
	// somebody has decided — which is why AwaitingCallID comes with it. That is
	// the call the eventual result has to answer, and a resumed run that
	// answered a different one would be answering a question nobody asked.
	Suspended      bool
	AwaitingCallID string

	// Usage is summed across steps, because that is what the exchange cost.
	Usage llm.Usage

	// Reasoning is the model's working across every step that asked for a
	// tool, joined in order. Carried separately from Text for the reason
	// Response.Thinking exists at all: it is not the answer, and a caller
	// storing this turn has to be able to hand it back on a wire that
	// requires the exact reasoning that produced a call to travel with the
	// call when the turn is replayed.
	Reasoning string
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

		response, err := llm.StreamOrComplete(ctx, l.Client, request, opts, l.sink())

		// An endpoint that will not take tools at all, asked again without them.
		//
		// "OpenAI compatible" is a claim, not a guarantee — the same reason
		// Streamer is a separate interface. Ollama is the case in hand: it
		// refuses a request outright when the model has no tool support, and
		// the models most people run locally do not. Without this, offering
		// tools would break plain conversation for exactly the local setup this
		// app goes out of its way to support.
		//
		// Once per run and only before anything has been streamed, so a reader
		// never sees the start of an answer twice.
		if err != nil && len(opts.Tools) > 0 && result.Text == "" && refusedTools(err) {
			opts.Tools = nil
			response, err = llm.StreamOrComplete(ctx, l.Client, request, opts, l.sink())
		}

		// Usage first: a step that failed part way still spent tokens, and the
		// count should say so even when there is nothing to show for them.
		result.Usage.InputTokens += response.Usage.InputTokens
		result.Usage.OutputTokens += response.Usage.OutputTokens
		if err != nil {
			return result, err
		}

		result.Text += response.Text()

		// Every step's working, including the last one's. This used to be kept
		// only for steps that asked for a tool, back when the only thing it was
		// for was being replayed alongside the call — which left the working of
		// a turn that simply answered on the floor. It is shown now as well as
		// replayed, and the step that produces the answer is the one whose
		// thinking a reader most wants to see.
		if thinking := response.Thinking(); thinking != "" {
			if result.Reasoning != "" {
				result.Reasoning += "\n\n"
			}
			result.Reasoning += thinking
		}

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

		results, awaiting, err := l.run(ctx, tools, calls)
		if err != nil {
			return result, err
		}

		// Stopped rather than finished. The prose so far is the answer as far
		// as it goes, and the caller now has a call id to bring a result back
		// for whenever somebody has decided.
		if awaiting != "" {
			result.Suspended = true
			result.AwaitingCallID = awaiting

			return result, nil
		}

		messages = append(messages, llm.Message{Role: llm.RoleUser, Content: results})
	}

	result.StepsExhausted = true

	return result, nil
}

// sink is where a step's stream is delivered. Built per step rather than held
// on the Loop because it is a view of the callbacks, not state of its own.
func (l *Loop) sink() llm.Sink {
	return llm.Sink{Text: l.text, Reasoning: l.reasoning}
}

func (l *Loop) text(chunk string) error {
	if l.OnText == nil {
		return nil
	}

	return l.OnText(chunk)
}

func (l *Loop) reasoning(chunk string) error {
	if l.OnReasoning == nil {
		return nil
	}

	return l.OnReasoning(chunk)
}

// run executes one step's calls and returns them as results.
//
// In the order the model asked, one at a time. Running them concurrently would
// be faster and would throw away the only ordering information there is: a
// model that asks to read a file and then search it said those in that order,
// and nothing here knows whether that mattered.
// The second return is the id of a call that is waiting on a person, empty when
// none is. Anything the model asked for after that one is not run: the person
// has not decided yet, and the calls behind it were asked against a workspace
// that is about to change. The model can ask again once it knows what happened,
// which is the whole point of being able to carry on.
func (l *Loop) run(
	ctx context.Context, tools map[string]Tool, calls []llm.ContentBlock,
) ([]llm.ContentBlock, string, error) {
	results := make([]llm.ContentBlock, 0, len(calls))

	for _, call := range calls {
		// Checked before each tool rather than only between steps: a run of
		// several slow tools should stop when the reader has gone, not finish
		// the set first.
		if err := ctx.Err(); err != nil {
			return nil, "", err
		}

		if l.OnToolStart != nil {
			l.OnToolStart(call.ID, call.Name, call.Input)
		}

		output, failed, awaiting := l.one(ctx, tools, call)

		// A cancelled context is the caller leaving, not a tool failing. Fed
		// back to the model as a result it would try again, and again, against
		// a connection that is already gone.
		if err := ctx.Err(); err != nil {
			return nil, "", err
		}

		// No OnToolEnd: nothing ended. The tool prepared something and stopped,
		// and reporting a result here would tell a surface that the call was
		// finished when the only true thing to say is that it is waiting.
		if awaiting {
			return results, call.ID, nil
		}

		if l.OnToolEnd != nil {
			l.OnToolEnd(call.ID, call.Name, output, failed)
		}

		results = append(results, llm.ToolResultBlock(call.ID, output, failed))
	}

	return results, "", nil
}

// one runs a single call, turning every way it can go wrong into something the
// model can read.
//
// Failures go back as results rather than up as errors because the model is
// what has to do something about them. Told that no note has that name it asks
// for a different one; handed nothing, it writes what the note would have said.
// The third return says the tool is waiting on a person, which is the one
// outcome that is neither a result nor a failure.
func (l *Loop) one(
	ctx context.Context, tools map[string]Tool, call llm.ContentBlock,
) (string, bool, bool) {
	tool, known := tools[call.Name]
	if !known {
		// It happens: a model will invent a tool that ought to exist. Saying
		// which ones do is more useful than saying no.
		return fmt.Sprintf(
			"No tool named %q. The tools available are: %s.",
			call.Name, names(l.Tools),
		), true, false
	}

	output, err := tool.Run(ctx, Call{ID: call.ID, Input: call.Input})
	if errors.Is(err, ErrAwaitingApproval) {
		return "", false, true
	}
	if err != nil {
		return err.Error(), true, false
	}

	// An empty result is a result, and one the model has to be told about in
	// words: a search that found nothing reads as a broken tool otherwise, and
	// the model fills the silence.
	if output == "" {
		return "(the tool returned nothing)", false, false
	}

	return output, false, false
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

// refusedTools reports whether a provider turned the request down because tools
// were on it.
//
// By reading the message, which is not a good way to decide anything — and is
// the only way available. Neither wire has a code for "this model has no tools";
// the endpoint returns an ordinary bad request and says why in prose. So the
// test is deliberately narrow: a refusal, from the provider, that mentions
// tools. A rejected credential or a rate limit says something else and is left
// alone, because retrying those without tools would only hide them.
func refusedTools(err error) bool {
	var apiError *llm.APIError
	if !errors.As(err, &apiError) {
		return false
	}
	if apiError.StatusCode < 400 || apiError.StatusCode >= 500 {
		return false
	}
	switch apiError.StatusCode {
	case http.StatusUnauthorized, http.StatusForbidden, http.StatusTooManyRequests:
		return false
	}

	return strings.Contains(strings.ToLower(apiError.Body), "tool")
}
