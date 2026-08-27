package llm

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"io"
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
	// Stream calls onText for each piece of the answer as it arrives, and
	// returns the whole thing once it is complete.
	//
	// A callback rather than a channel or an iterator: the caller is an HTTP
	// handler writing server-sent events, so it wants to be pushed to, and
	// this way cancellation and cleanup stay ordinary Go. An error returned
	// from onText stops the stream and comes back from Stream — that is how a
	// disconnected browser stops work that no longer has a reader.
	Stream(ctx context.Context, request Context, opts Options, onText func(string) error) (Response, error)
}

// StreamOrComplete streams when the client can and falls back to one whole
// answer when it cannot.
//
// The fallback is not a degraded stream: onText is called once, with
// everything. That keeps the caller's code identical in both cases, which
// matters because whether streaming is available depends on which endpoint the
// user happened to configure.
func StreamOrComplete(
	ctx context.Context,
	client Client,
	request Context,
	opts Options,
	onText func(string) error,
) (Response, error) {
	if streamer, ok := client.(Streamer); ok {
		return streamer.Stream(ctx, request, opts, onText)
	}

	response, err := client.Complete(ctx, request, opts)
	if err != nil {
		return Response{}, err
	}

	if text := response.Text(); text != "" {
		if err := onText(text); err != nil {
			return Response{}, err
		}
	}

	return response, nil
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
