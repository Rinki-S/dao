// Package llmtest provides a stand-in model for tests.
//
// The harness above must be testable without reaching a real provider: its
// interesting behaviour is what it does with an answer — parse it, validate
// it, retry it, record it — and none of that should depend on a network, a
// key, or a model's mood. A fake makes those paths reachable on demand,
// including the ones a real provider produces only rarely.
package llmtest

import (
	"context"
	"fmt"

	"github.com/rinki-s/dao/apps/local-service/internal/ai/llm"
)

// Turn is one queued answer. Err is returned as-is when set, which is how a
// test reaches the failure paths that matter: a refused key, a rate limit, a
// timeout.
type Turn struct {
	Text  string
	Usage llm.Usage
	Stop  llm.StopReason
	Err   error
}

// Fake answers with its queued turns in order.
//
// Requests holds what it was asked, so a test can assert on the prompt that
// was built rather than only on what came back — the context a run assembles
// is as much of the behaviour as the answer is.
type Fake struct {
	Turns    []Turn
	Requests []llm.Context
	Options  []llm.Options

	next int
}

// Text queues a single successful answer.
func Text(answer string) *Fake {
	return &Fake{Turns: []Turn{{Text: answer, Stop: llm.StopEnd}}}
}

// Sequence queues answers for a caller expected to ask more than once — a
// validation retry, for instance.
func Sequence(turns ...Turn) *Fake {
	return &Fake{Turns: turns}
}

func (f *Fake) Complete(_ context.Context, request llm.Context, opts llm.Options) (llm.Response, error) {
	f.Requests = append(f.Requests, request)
	f.Options = append(f.Options, opts)

	if f.next >= len(f.Turns) {
		// Louder than returning an empty answer: a caller that asked more
		// times than the test expected has a bug the test should name.
		return llm.Response{}, fmt.Errorf("llmtest: no queued turn for call %d", f.next+1)
	}

	turn := f.Turns[f.next]
	f.next++

	response := llm.Response{Usage: turn.Usage, StopReason: turn.Stop}
	if response.StopReason == "" {
		response.StopReason = llm.StopEnd
	}
	if turn.Text != "" {
		response.Content = []llm.ContentBlock{llm.TextBlock(turn.Text)}
	}
	if turn.Err != nil {
		// Usage still travels with the error: a call that failed part-way
		// still spent tokens, and the trace should record them.
		return response, turn.Err
	}

	return response, nil
}

// Calls is how many times the model was asked.
func (f *Fake) Calls() int {
	return f.next
}

// StreamingFake answers the way an endpoint that streams does.
//
// A separate type rather than a method on Fake, because whether a client
// implements Streamer is itself behaviour worth testing: llm.StreamOrComplete
// takes one path when it does and another when it does not, and a Fake that
// always streamed would leave the fallback unreachable.
type StreamingFake struct {
	Fake

	// Chunks is how many pieces an answer is delivered in. A real endpoint
	// decides this for itself and a caller must not depend on where the splits
	// land, which is exactly why a test should be able to move them.
	Chunks int
}

// Streamed queues a single answer, delivered in the given number of pieces.
func Streamed(answer string, chunks int) *StreamingFake {
	return &StreamingFake{
		Fake:   Fake{Turns: []Turn{{Text: answer, Stop: llm.StopEnd}}},
		Chunks: chunks,
	}
}

// Stream delivers the queued answer in pieces and only then returns the turn's
// error, if it has one. That order is the point: it is the shape of a stream
// that dies part-way through, having already handed the caller real text.
func (f *StreamingFake) Stream(
	ctx context.Context,
	request llm.Context,
	opts llm.Options,
	onText func(string) error,
) (llm.Response, error) {
	response, err := f.Fake.Complete(ctx, request, opts)

	for _, chunk := range pieces(response.Text(), f.Chunks) {
		if writeErr := onText(chunk); writeErr != nil {
			return response, writeErr
		}
	}

	return response, err
}

// pieces cuts text into roughly equal parts, by byte. Splitting a multi-byte
// character across two events is a thing real endpoints do, and a caller that
// only reassembles the pieces should not care.
func pieces(text string, count int) []string {
	if text == "" {
		return nil
	}
	if count <= 1 || count > len(text) {
		return []string{text}
	}

	size := (len(text) + count - 1) / count
	parts := []string{}

	for start := 0; start < len(text); start += size {
		end := start + size
		if end > len(text) {
			end = len(text)
		}
		parts = append(parts, text[start:end])
	}

	return parts
}
