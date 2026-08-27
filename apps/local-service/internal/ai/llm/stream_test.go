package llm

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// sseServer replies with the given lines as a server-sent event stream,
// flushing each one so a test exercises the same arrival-in-pieces behaviour a
// real provider produces rather than one buffered write.
func sseServer(t *testing.T, lines ...string) *httptest.Server {
	t.Helper()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("content-type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			t.Error("test server cannot flush, so nothing would arrive in pieces")
			return
		}

		for _, line := range lines {
			fmt.Fprintf(w, "%s\n\n", line)
			flusher.Flush()
		}
	}))
	t.Cleanup(server.Close)

	return server
}

func streamClient(t *testing.T, wire Wire, baseURL string) Streamer {
	t.Helper()

	client, err := New(Config{Wire: wire, BaseURL: baseURL, Model: "m", APIKey: "k"}, nil)
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	streamer, ok := client.(Streamer)
	if !ok {
		t.Fatalf("%s client does not stream", wire)
	}

	return streamer
}

// collect runs a stream and records the pieces separately from the whole, so a
// test can tell "arrived in three deltas" from "arrived as one blob".
func collect(t *testing.T, streamer Streamer) ([]string, Response) {
	t.Helper()

	var pieces []string
	response, err := streamer.Stream(t.Context(), Context{
		Messages: []Message{UserText("hi")},
	}, Options{MaxTokens: 64}, func(text string) error {
		pieces = append(pieces, text)
		return nil
	})
	if err != nil {
		t.Fatalf("Stream: %v", err)
	}

	return pieces, response
}

func TestOpenAIStreamsInPieces(t *testing.T) {
	server := sseServer(t,
		`data: {"choices":[{"delta":{"role":"assistant","content":"Hel"},"finish_reason":null}]}`,
		`data: {"choices":[{"delta":{"content":"lo"},"finish_reason":null}]}`,
		`data: {"choices":[{"delta":{},"finish_reason":"stop"}]}`,
		// The usage chunk carries an empty choices array. Reading choices[0]
		// here is the obvious bug, and the one this line exists to catch.
		`data: {"choices":[],"usage":{"prompt_tokens":7,"completion_tokens":2}}`,
		`data: [DONE]`,
	)

	pieces, response := collect(t, streamClient(t, WireOpenAI, server.URL))

	if got := strings.Join(pieces, "|"); got != "Hel|lo" {
		t.Errorf("pieces = %q, want two separate deltas", got)
	}
	if got := response.Text(); got != "Hello" {
		t.Errorf("Text() = %q, want the reassembled answer", got)
	}
	if response.StopReason != StopEnd {
		t.Errorf("StopReason = %q", response.StopReason)
	}
	if response.Usage.InputTokens != 7 || response.Usage.OutputTokens != 2 {
		t.Errorf("Usage = %+v, want the final chunk's numbers", response.Usage)
	}
}

func TestAnthropicStreamsInPieces(t *testing.T) {
	server := sseServer(t,
		`event: message_start`,
		`data: {"type":"message_start","message":{"usage":{"input_tokens":7}}}`,
		`event: ping`,
		`data: {"type":"ping"}`,
		`data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hel"}}`,
		`data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"lo"}}`,
		// A thinking delta must not reach the caller: it is the model's own
		// working, which this package declines to carry.
		`data: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"hmm"}}`,
		`data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":2}}`,
		`data: {"type":"message_stop"}`,
	)

	pieces, response := collect(t, streamClient(t, WireAnthropic, server.URL))

	if got := strings.Join(pieces, "|"); got != "Hel|lo" {
		t.Errorf("pieces = %q, want the text deltas only", got)
	}
	if got := response.Text(); got != "Hello" {
		t.Errorf("Text() = %q", got)
	}
	if response.Usage.InputTokens != 7 || response.Usage.OutputTokens != 2 {
		t.Errorf("Usage = %+v, want tokens from both ends of the stream", response.Usage)
	}
}

// An unrecognised event type must not fail the stream. The wire is free to add
// events, and a client that broke on a new one would break on an upgrade.
func TestAnthropicIgnoresUnknownEvents(t *testing.T) {
	server := sseServer(t,
		`data: {"type":"something_new","whatever":{"nested":true}}`,
		`data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"ok"}}`,
	)

	_, response := collect(t, streamClient(t, WireAnthropic, server.URL))

	if got := response.Text(); got != "ok" {
		t.Errorf("Text() = %q, want the stream to have survived the unknown event", got)
	}
}

// A provider can fail after the 200: the status goes out before the model has
// written anything, so a mid-generation failure has nowhere to go but the
// stream. Reporting the partial answer as a success would be a silent truncation.
func TestAnthropicSurfacesAnErrorEvent(t *testing.T) {
	server := sseServer(t,
		`data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"partial"}}`,
		`data: {"type":"error","error":{"type":"overloaded_error","message":"try later"}}`,
	)

	_, err := streamClient(t, WireAnthropic, server.URL).Stream(
		t.Context(), Context{Messages: []Message{UserText("hi")}}, Options{MaxTokens: 64},
		func(string) error { return nil },
	)

	if err == nil {
		t.Fatal("a mid-stream error was reported as success")
	}
	if !strings.Contains(err.Error(), "overloaded_error") {
		t.Errorf("error = %v, want it to name what the provider said", err)
	}
}

// What stops work when the reader goes away. The caller is an HTTP handler
// writing to a browser, and a browser that navigated away should not leave a
// local model generating into nothing.
func TestAnErrorFromTheCallbackStopsTheStream(t *testing.T) {
	server := sseServer(t,
		`data: {"choices":[{"delta":{"content":"one"}}]}`,
		`data: {"choices":[{"delta":{"content":"two"}}]}`,
		`data: {"choices":[{"delta":{"content":"three"}}]}`,
		`data: [DONE]`,
	)

	stop := errors.New("reader went away")
	seen := 0

	_, err := streamClient(t, WireOpenAI, server.URL).Stream(
		t.Context(), Context{Messages: []Message{UserText("hi")}}, Options{MaxTokens: 64},
		func(string) error {
			seen++
			return stop
		},
	)

	if !errors.Is(err, stop) {
		t.Errorf("err = %v, want the callback's own error", err)
	}
	if seen != 1 {
		t.Errorf("callback ran %d times, want it to stop at the first refusal", seen)
	}
}

// A 200 with nothing in it is the streaming counterpart of a completion with
// no choices: an endpoint compatible in name only. Reporting it as an empty
// answer sends the caller off to blame the model.
func TestAnEmptyStreamIsAnError(t *testing.T) {
	server := sseServer(t, `data: [DONE]`)

	_, err := streamClient(t, WireOpenAI, server.URL).Stream(
		t.Context(), Context{Messages: []Message{UserText("hi")}}, Options{MaxTokens: 64},
		func(string) error { return nil },
	)

	if err == nil {
		t.Error("an empty stream was reported as a successful answer")
	}
}

func TestStreamFailsOnAnErrorStatus(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, `{"error":"nope"}`, http.StatusTooManyRequests)
	}))
	defer server.Close()

	_, err := streamClient(t, WireOpenAI, server.URL).Stream(
		t.Context(), Context{Messages: []Message{UserText("hi")}}, Options{MaxTokens: 64},
		func(string) error { return nil },
	)

	var apiError *APIError
	if !errors.As(err, &apiError) {
		t.Fatalf("err = %v, want an APIError", err)
	}
	if apiError.StatusCode != http.StatusTooManyRequests {
		t.Errorf("StatusCode = %d", apiError.StatusCode)
	}
}

// completeOnly is a client that cannot stream — the case StreamOrComplete
// exists for.
type completeOnly struct{ text string }

func (c completeOnly) Complete(context.Context, Context, Options) (Response, error) {
	return Response{Content: []ContentBlock{TextBlock(c.text)}, StopReason: StopEnd}, nil
}

func TestStreamOrCompleteFallsBackToOneWholeAnswer(t *testing.T) {
	var pieces []string

	response, err := StreamOrComplete(t.Context(), completeOnly{text: "all at once"},
		Context{Messages: []Message{UserText("hi")}}, Options{MaxTokens: 64},
		func(text string) error {
			pieces = append(pieces, text)
			return nil
		})
	if err != nil {
		t.Fatalf("StreamOrComplete: %v", err)
	}

	// One call, with everything. The caller's code is then identical either
	// way, which is the whole point of the fallback.
	if len(pieces) != 1 || pieces[0] != "all at once" {
		t.Errorf("pieces = %q, want a single call carrying the whole answer", pieces)
	}
	if response.Text() != "all at once" {
		t.Errorf("Text() = %q", response.Text())
	}
}

func TestStreamOrCompleteUsesTheStreamWhenThereIsOne(t *testing.T) {
	server := sseServer(t,
		`data: {"choices":[{"delta":{"content":"a"}}]}`,
		`data: {"choices":[{"delta":{"content":"b"}}]}`,
		`data: [DONE]`,
	)

	client, err := New(Config{Wire: WireOpenAI, BaseURL: server.URL, Model: "m", APIKey: "k"}, nil)
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	var pieces []string
	if _, err := StreamOrComplete(t.Context(), client,
		Context{Messages: []Message{UserText("hi")}}, Options{MaxTokens: 64},
		func(text string) error {
			pieces = append(pieces, text)
			return nil
		}); err != nil {
		t.Fatalf("StreamOrComplete: %v", err)
	}

	if len(pieces) != 2 {
		t.Errorf("pieces = %q, want the stream's own deltas rather than one blob", pieces)
	}
}
