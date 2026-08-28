package llm

import (
	"context"
	"testing"
)

// streamWithTools streams and returns the prose the caller was handed, apart from
// the calls it ended up with. Keeping them apart is the point: a tool's
// arguments must never reach the reader as if they were an answer.
func streamWithTools(t *testing.T, wire Wire, lines ...string) (string, Response) {
	t.Helper()

	server := sseServer(t, lines...)
	prose := ""

	response, err := streamClient(t, wire, server.URL).Stream(
		context.Background(), request(), Options{MaxTokens: 100},
		func(chunk string) error {
			prose += chunk
			return nil
		},
	)
	if err != nil {
		t.Fatalf("Stream: %v", err)
	}

	return prose, response
}

func TestAnthropicStreamsACallInFragments(t *testing.T) {
	prose, response := streamWithTools(t, WireAnthropic,
		`data: {"type":"message_start","message":{"usage":{"input_tokens":40}}}`,
		`data: {"type":"content_block_start","index":0,"content_block":{"type":"text"}}`,
		`data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Let me look."}}`,
		`data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"call-1","name":"search_notes"}}`,
		`data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\"query\":"}}`,
		`data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"\"parser\"}"}}`,
		`data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":18}}`,
	)

	if prose != "Let me look." {
		t.Errorf("the reader was handed %q", prose)
	}

	calls := response.ToolCalls()
	if len(calls) != 1 {
		t.Fatalf("collected %d calls, want 1", len(calls))
	}
	if calls[0].ID != "call-1" || calls[0].Name != "search_notes" {
		t.Errorf("call = %+v", calls[0])
	}
	// Reassembled from two fragments that are each invalid JSON on their own.
	if string(calls[0].Input) != `{"query":"parser"}` {
		t.Errorf("arguments = %s", calls[0].Input)
	}
	if response.StopReason != StopToolUse {
		t.Errorf("stop reason = %q", response.StopReason)
	}
	if response.Usage.InputTokens != 40 || response.Usage.OutputTokens != 18 {
		t.Errorf("usage = %+v", response.Usage)
	}
}

func TestOpenAIStreamsACallInFragments(t *testing.T) {
	prose, response := streamWithTools(t, WireOpenAI,
		`data: {"choices":[{"delta":{"content":"Let me look."}}]}`,
		`data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","function":{"name":"search_notes","arguments":""}}]}}]}`,
		`data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\"query\":"}}]}}]}`,
		`data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\"parser\"}"}}]}}]}`,
		`data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}`,
		`data: {"choices":[],"usage":{"prompt_tokens":40,"completion_tokens":18}}`,
		`data: [DONE]`,
	)

	if prose != "Let me look." {
		t.Errorf("the reader was handed %q", prose)
	}

	calls := response.ToolCalls()
	if len(calls) != 1 {
		t.Fatalf("collected %d calls, want 1", len(calls))
	}
	// The id and the name came with the first fragment and never again, which
	// is why the accumulator keys on position.
	if calls[0].ID != "call-1" || calls[0].Name != "search_notes" {
		t.Errorf("call = %+v", calls[0])
	}
	if string(calls[0].Input) != `{"query":"parser"}` {
		t.Errorf("arguments = %s", calls[0].Input)
	}
	if response.StopReason != StopToolUse {
		t.Errorf("stop reason = %q", response.StopReason)
	}
}

// Two calls at once, interleaved, which is what asking for two tools in one
// breath actually looks like on the wire.
func TestTwoCallsStreamedTogetherKeepTheirOrder(t *testing.T) {
	t.Run("anthropic", func(t *testing.T) {
		_, response := streamWithTools(t, WireAnthropic,
			`data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"a","name":"first"}}`,
			`data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"b","name":"second"}}`,
			`data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\"n\":2}"}}`,
			`data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\"n\":1}"}}`,
			`data: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}`,
		)

		assertOrder(t, response)
	})

	t.Run("openai", func(t *testing.T) {
		_, response := streamWithTools(t, WireOpenAI,
			`data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"a","function":{"name":"first"}}]}}]}`,
			`data: {"choices":[{"delta":{"tool_calls":[{"index":1,"id":"b","function":{"name":"second"}}]}}]}`,
			`data: {"choices":[{"delta":{"tool_calls":[{"index":1,"function":{"arguments":"{\"n\":2}"}}]}}]}`,
			`data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\"n\":1}"}}]}}]}`,
			`data: [DONE]`,
		)

		assertOrder(t, response)
	})
}

// The fragments arrive out of order above, and the calls still come back in the
// order the model opened them. A model that asks to read a file and then search
// it meant those in that order.
func assertOrder(t *testing.T, response Response) {
	t.Helper()

	calls := response.ToolCalls()
	if len(calls) != 2 {
		t.Fatalf("collected %d calls, want 2", len(calls))
	}
	if calls[0].Name != "first" || calls[1].Name != "second" {
		t.Fatalf("calls came back as %q then %q", calls[0].Name, calls[1].Name)
	}
	if string(calls[0].Input) != `{"n":1}` || string(calls[1].Input) != `{"n":2}` {
		t.Errorf("arguments landed on the wrong calls: %s and %s", calls[0].Input, calls[1].Input)
	}
}

// A tool that takes nothing streams no fragments at all, and a caller about to
// decode the arguments needs an object rather than an empty string.
func TestACallWithNoArgumentsStillDecodes(t *testing.T) {
	_, response := streamWithTools(t, WireAnthropic,
		`data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"a","name":"list_tasks"}}`,
		`data: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}`,
	)

	calls := response.ToolCalls()
	if len(calls) != 1 {
		t.Fatalf("collected %d calls, want 1", len(calls))
	}
	if string(calls[0].Input) != "{}" {
		t.Errorf("arguments = %q, want an empty object", calls[0].Input)
	}
}
