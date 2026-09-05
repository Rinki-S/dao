package llm

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"strings"
)

// Streamer is a client that can deliver an answer while it is still being
// written.
//
// Kept apart from Client rather than folded into it. A summary that gets
// validated against a schema cannot act on half an answer, so Complete stays
// the whole surface for that; chat is the opposite, and waiting nine seconds
// for a local model to finish before showing anything reads as a hang. Two
// interfaces let a caller ask for what it actually needs.
//
// Separate also because "OpenAI compatible" is a claim, not a guarantee. Some
// endpoints implement stream: true poorly or not at all, and a caller that can
// fall back should be able to ask beforehand rather than discover it halfway
// through a response.
type Streamer interface {
	// Stream hands each piece of the answer to the sink as it arrives, and
	// returns the whole thing once it is complete.
	//
	// Callbacks rather than a channel or an iterator: the caller is an HTTP
	// handler writing server-sent events, so it wants to be pushed to, and
	// this way cancellation and cleanup stay ordinary Go. An error returned
	// from a callback stops the stream and comes back from Stream — that is
	// how a disconnected browser stops work that no longer has a reader.
	Stream(ctx context.Context, request Context, opts Options, sink Sink) (Response, error)
}

// Sink is where a stream's pieces go as they arrive.
//
// A struct rather than one more parameter, because what arrives on a stream is
// not all one kind of thing. Prose and a reasoning model's working both come a
// fragment at a time and must not be run together: one is the answer and the
// other is how the model got to it, and a caller that received them as one
// flow would have no way to tell them apart afterwards. A caller that only
// wants the answer leaves Reasoning nil.
type Sink struct {
	Text      func(string) error
	Reasoning func(string) error
}

// TextSink is the common case — a caller that wants the prose and nothing else.
func TextSink(onText func(string) error) Sink {
	return Sink{Text: onText}
}

// A nil callback is not an error. Which pieces a caller cares about is its own
// business, and making every wire check before every call would put that
// decision in the wrong place.
func (s Sink) text(chunk string) error {
	if s.Text == nil {
		return nil
	}

	return s.Text(chunk)
}

func (s Sink) reasoning(chunk string) error {
	if s.Reasoning == nil {
		return nil
	}

	return s.Reasoning(chunk)
}

// StreamOrComplete streams when the client can and falls back to one whole
// answer when it cannot.
//
// The fallback is not a degraded stream: each callback is called once, with
// everything it would have received in pieces, and in the order the pieces
// would have arrived. That keeps the caller's code identical in both cases,
// which matters because whether streaming is available depends on which
// endpoint the user happened to configure.
func StreamOrComplete(
	ctx context.Context,
	client Client,
	request Context,
	opts Options,
	sink Sink,
) (Response, error) {
	if streamer, ok := client.(Streamer); ok {
		return streamer.Stream(ctx, request, opts, sink)
	}

	response, err := client.Complete(ctx, request, opts)
	if err != nil {
		return Response{}, err
	}

	// Working first, then the answer: that is the order a model produces them
	// in, and a surface replaying them the other way round would show the
	// conclusion before the thinking that reached it.
	if thinking := response.Thinking(); thinking != "" {
		if err := sink.reasoning(thinking); err != nil {
			return Response{}, err
		}
	}

	if text := response.Text(); text != "" {
		if err := sink.text(text); err != nil {
			return Response{}, err
		}
	}

	return response, nil
}

// toolCalls accumulates calls that arrive in pieces.
//
// Both wires stream a tool's arguments as fragments of JSON keyed by the call's
// position in the turn, and differ only in what they call the fields. So the
// gathering lives here once rather than twice, and each wire is left with the
// part that is genuinely its own: how it says "a call starts" and "here is more
// of its arguments".
//
// Position rather than id, because on the OpenAI wire the id arrives with the
// first fragment and nothing after it — there is no id to key on when the
// second fragment turns up.
type toolCalls struct {
	order   []int
	partial map[int]*partialCall
}

type partialCall struct {
	id        string
	name      string
	arguments strings.Builder
}

func (t *toolCalls) at(index int) *partialCall {
	if t.partial == nil {
		t.partial = map[int]*partialCall{}
	}
	if call, seen := t.partial[index]; seen {
		return call
	}

	call := &partialCall{}
	t.partial[index] = call
	// Kept in the order the wire opened them, which is the order the model
	// asked for them in. A map's iteration order would shuffle two calls whose
	// sequence the model may well have meant.
	t.order = append(t.order, index)

	return call
}

// start records a call's identity. Called when the wire announces one, which on
// both wires is the only moment the id and the name are sent.
func (t *toolCalls) start(index int, id, name string) {
	call := t.at(index)
	if id != "" {
		call.id = id
	}
	if name != "" {
		call.name = name
	}
}

// argument adds a fragment of the call's arguments.
func (t *toolCalls) argument(index int, fragment string) {
	t.at(index).arguments.WriteString(fragment)
}

// blocks is the finished calls.
//
// Nothing is reported until the stream is over, which is the difference between
// a tool call and text: prose is useful a word at a time, and half a call
// cannot be run at all. A caller waiting to display "reading your notes" waits
// for the whole call, and that is correct — the alternative is announcing a
// tool the model was still in the middle of naming.
func (t *toolCalls) blocks() []ContentBlock {
	var blocks []ContentBlock

	for _, index := range t.order {
		call := t.partial[index]

		// A tool that takes no arguments is streamed with no fragments at all,
		// and a tool expecting to decode its arguments needs an object rather
		// than nothing.
		arguments := call.arguments.String()
		if arguments == "" {
			arguments = "{}"
		}

		blocks = append(blocks, ToolCallBlock(call.id, call.name, json.RawMessage(arguments)))
	}

	return blocks
}

// sseData is the payload of one server-sent event.
//
// The format is a stream of "field: value" lines with blank lines between
// events. Only the data field carries anything either wire needs, so the other
// fields are read and dropped rather than modelled — Anthropic's event: lines
// name a type that its own data payload repeats.
const sseDataPrefix = "data:"

// sseDone is what the OpenAI wire sends instead of a final JSON object.
const sseDone = "[DONE]"

// maxSSELine bounds one event's data.
//
// bufio.Scanner refuses a token longer than its buffer, and its default is
// 64KB. A single delta is small, but a provider is free to send the whole
// answer as one event, and an answer longer than the default would fail as a
// scan error rather than a slow read. 1MB is far past any real event and still
// bounded, which is the point: an unbounded read is a way for a misbehaving
// endpoint to exhaust memory.
const maxSSELine = 1 << 20

// scanSSE walks the data payloads of a server-sent event stream.
//
// onData returns false to stop reading — used for the [DONE] sentinel, and for
// a caller that has seen everything it needs.
func scanSSE(body io.Reader, onData func(data []byte) (bool, error)) error {
	scanner := bufio.NewScanner(body)
	scanner.Buffer(make([]byte, 0, 64*1024), maxSSELine)

	for scanner.Scan() {
		line := bytes.TrimSpace(scanner.Bytes())

		// Blank lines separate events and comment lines (":" keep-alives) are
		// there to hold the connection open. Both are structure, not content.
		if len(line) == 0 || !bytes.HasPrefix(line, []byte(sseDataPrefix)) {
			continue
		}

		data := bytes.TrimSpace(line[len(sseDataPrefix):])
		if len(data) == 0 {
			continue
		}

		keepGoing, err := onData(data)
		if err != nil {
			return err
		}
		if !keepGoing {
			return nil
		}
	}

	if err := scanner.Err(); err != nil {
		return fmt.Errorf("read stream: %w", err)
	}

	return nil
}
