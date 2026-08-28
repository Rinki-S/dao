package llm

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"
)

// The schema a tool is offered with. Kept as a literal because what these tests
// check is that these exact bytes reach the provider, under whichever name that
// wire gives the field.
const searchSchema = `{"type":"object","properties":{"query":{"type":"string"}},"required":["query"]}`

func searchNotes() ToolDefinition {
	return ToolDefinition{
		Name:        "search_notes",
		Description: "Search the workspace's notes.",
		Schema:      json.RawMessage(searchSchema),
	}
}

// A conversation that has already been round the loop once: the model asked for
// a tool, the tool answered, and the model is being asked again. Every wire has
// to be able to replay this, or a second step would arrive with the model's own
// call missing from its history.
func toolExchange() Context {
	return Context{
		SystemPrompt: "Be brief.",
		Messages: []Message{
			UserText("What did I write about parsers?"),
			{Role: RoleAssistant, Content: []ContentBlock{
				TextBlock("Let me look."),
				ToolCallBlock("call-1", "search_notes", json.RawMessage(`{"query":"parser"}`)),
			}},
			{Role: RoleUser, Content: []ContentBlock{
				ToolResultBlock("call-1", "Parser recovery strategy.md", false),
			}},
		},
	}
}

func TestAnthropicSendsToolsAndReplaysAnExchange(t *testing.T) {
	server, recorded := serve(t, http.StatusOK, `{
		"content": [
			{"type": "text", "text": "One note mentions it."},
			{"type": "tool_use", "id": "call-2", "name": "search_notes",
			 "input": {"query": "recovery"}}
		],
		"stop_reason": "tool_use",
		"usage": {"input_tokens": 200, "output_tokens": 20}
	}`)

	client := newClient(t, WireAnthropic, server.URL)

	response, err := client.Complete(
		context.Background(), toolExchange(), Options{MaxTokens: 100, Tools: []ToolDefinition{searchNotes()}},
	)
	if err != nil {
		t.Fatalf("Complete: %v", err)
	}

	tools, _ := recorded.body["tools"].([]any)
	if len(tools) != 1 {
		t.Fatalf("sent %d tools, want 1", len(tools))
	}

	tool, _ := tools[0].(map[string]any)
	if tool["name"] != "search_notes" {
		t.Errorf("tool name = %v", tool["name"])
	}
	// This wire calls it input_schema. Getting the name wrong is a 400 from the
	// provider and nothing else, so it is worth pinning.
	if _, ok := tool["input_schema"]; !ok {
		t.Errorf("no input_schema on the tool: %v", tool)
	}

	messages, _ := recorded.body["messages"].([]any)
	if len(messages) != 3 {
		t.Fatalf("sent %d messages, want the exchange replayed as 3", len(messages))
	}

	assistant, _ := messages[1].(map[string]any)
	blocks, _ := assistant["content"].([]any)
	if len(blocks) != 2 {
		t.Fatalf("assistant turn carried %d blocks, want its prose and its call", len(blocks))
	}
	call, _ := blocks[1].(map[string]any)
	if call["type"] != "tool_use" || call["id"] != "call-1" {
		t.Errorf("call block = %v", call)
	}

	// The result rides inside a user message on this wire, which is the shape
	// this package normalised on.
	result, _ := messages[2].(map[string]any)
	if result["role"] != "user" {
		t.Errorf("result travelled as role %v, want user", result["role"])
	}
	resultBlocks, _ := result["content"].([]any)
	resultBlock, _ := resultBlocks[0].(map[string]any)
	if resultBlock["type"] != "tool_result" || resultBlock["tool_use_id"] != "call-1" {
		t.Errorf("result block = %v", resultBlock)
	}

	calls := response.ToolCalls()
	if len(calls) != 1 {
		t.Fatalf("read back %d calls, want 1", len(calls))
	}
	if calls[0].ID != "call-2" || calls[0].Name != "search_notes" {
		t.Errorf("call = %+v", calls[0])
	}
	if string(calls[0].Input) != `{"query": "recovery"}` {
		t.Errorf("input = %s", calls[0].Input)
	}
	if response.StopReason != StopToolUse {
		t.Errorf("stop reason = %q, want %q", response.StopReason, StopToolUse)
	}
	// The prose and the call are both there, and Text is only the prose.
	if response.Text() != "One note mentions it." {
		t.Errorf("text = %q", response.Text())
	}
}

func TestOpenAISendsToolsAndSplitsTheResultIntoItsOwnMessage(t *testing.T) {
	server, recorded := serve(t, http.StatusOK, `{
		"choices": [{
			"message": {
				"content": "One note mentions it.",
				"tool_calls": [{
					"id": "call-2", "type": "function",
					"function": {"name": "search_notes", "arguments": "{\"query\":\"recovery\"}"}
				}]
			},
			"finish_reason": "tool_calls"
		}],
		"usage": {"prompt_tokens": 200, "completion_tokens": 20}
	}`)

	client := newClient(t, WireOpenAI, server.URL)

	response, err := client.Complete(
		context.Background(), toolExchange(), Options{MaxTokens: 100, Tools: []ToolDefinition{searchNotes()}},
	)
	if err != nil {
		t.Fatalf("Complete: %v", err)
	}

	tools, _ := recorded.body["tools"].([]any)
	if len(tools) != 1 {
		t.Fatalf("sent %d tools, want 1", len(tools))
	}
	tool, _ := tools[0].(map[string]any)
	if tool["type"] != "function" {
		t.Errorf("tool envelope type = %v, want function", tool["type"])
	}
	function, _ := tool["function"].(map[string]any)
	// The same schema, under this wire's name for the field.
	if _, ok := function["parameters"]; !ok {
		t.Errorf("no parameters on the function: %v", function)
	}

	// System prompt, question, assistant turn, tool result — four here against
	// the other wire's three, because a result is a message of its own.
	messages, _ := recorded.body["messages"].([]any)
	if len(messages) != 4 {
		t.Fatalf("sent %d messages, want 4", len(messages))
	}

	assistant, _ := messages[2].(map[string]any)
	if assistant["role"] != "assistant" {
		t.Fatalf("message 2 = %v", assistant)
	}
	sentCalls, _ := assistant["tool_calls"].([]any)
	if len(sentCalls) != 1 {
		t.Fatalf("assistant turn carried %d calls, want 1", len(sentCalls))
	}
	sentCall, _ := sentCalls[0].(map[string]any)
	sentFunction, _ := sentCall["function"].(map[string]any)
	// Arguments are a string of JSON on this wire, not JSON. A test that
	// accepted either would not notice the day this stops being true.
	if arguments, ok := sentFunction["arguments"].(string); !ok {
		t.Errorf("arguments went up as %T, want a string", sentFunction["arguments"])
	} else if arguments != `{"query":"parser"}` {
		t.Errorf("arguments = %s", arguments)
	}

	toolMessage, _ := messages[3].(map[string]any)
	if toolMessage["role"] != "tool" || toolMessage["tool_call_id"] != "call-1" {
		t.Errorf("result message = %v", toolMessage)
	}
	if toolMessage["content"] != "Parser recovery strategy.md" {
		t.Errorf("result content = %v", toolMessage["content"])
	}

	calls := response.ToolCalls()
	if len(calls) != 1 {
		t.Fatalf("read back %d calls, want 1", len(calls))
	}
	if calls[0].ID != "call-2" || string(calls[0].Input) != `{"query":"recovery"}` {
		t.Errorf("call = %+v", calls[0])
	}
	if response.StopReason != StopToolUse {
		t.Errorf("stop reason = %q, want %q", response.StopReason, StopToolUse)
	}
}

// Ordering, on the wire that has to invent it. A tool message answers the calls
// before it, so prose in the same turn has to follow the results rather than
// lead them.
func TestOpenAIPutsResultsBeforeTheProseTheyArriveWith(t *testing.T) {
	server, recorded := serve(t, http.StatusOK, `{
		"choices": [{"message": {"content": "ok"}, "finish_reason": "stop"}],
		"usage": {"prompt_tokens": 1, "completion_tokens": 1}
	}`)

	client := newClient(t, WireOpenAI, server.URL)

	_, err := client.Complete(context.Background(), Context{
		Messages: []Message{{Role: RoleUser, Content: []ContentBlock{
			ToolResultBlock("call-1", "the file says this", false),
			TextBlock("and here is my next question"),
		}}},
	}, Options{MaxTokens: 10})
	if err != nil {
		t.Fatalf("Complete: %v", err)
	}

	messages, _ := recorded.body["messages"].([]any)
	if len(messages) != 2 {
		t.Fatalf("sent %d messages, want the result and the prose", len(messages))
	}

	first, _ := messages[0].(map[string]any)
	second, _ := messages[1].(map[string]any)
	if first["role"] != "tool" {
		t.Errorf("first message = %v, want the tool result", first)
	}
	if second["role"] != "user" || second["content"] != "and here is my next question" {
		t.Errorf("second message = %v", second)
	}
}

// A failed tool is reported to the model as a result, not raised as an error.
// A model told that a file does not exist asks for a different one; a model
// handed nothing invents its contents.
func TestAFailedToolIsReportedToTheModel(t *testing.T) {
	failure := Context{Messages: []Message{{Role: RoleUser, Content: []ContentBlock{
		ToolResultBlock("call-1", "no note by that name", true),
	}}}}

	t.Run("anthropic", func(t *testing.T) {
		server, recorded := serve(t, http.StatusOK, `{
			"content": [{"type": "text", "text": "ok"}],
			"stop_reason": "end_turn", "usage": {"input_tokens": 1, "output_tokens": 1}
		}`)

		if _, err := newClient(t, WireAnthropic, server.URL).Complete(
			context.Background(), failure, Options{MaxTokens: 10},
		); err != nil {
			t.Fatalf("Complete: %v", err)
		}

		messages, _ := recorded.body["messages"].([]any)
		message, _ := messages[0].(map[string]any)
		blocks, _ := message["content"].([]any)
		block, _ := blocks[0].(map[string]any)

		if block["is_error"] != true {
			t.Errorf("is_error = %v, want true", block["is_error"])
		}
	})

	t.Run("openai", func(t *testing.T) {
		server, recorded := serve(t, http.StatusOK, `{
			"choices": [{"message": {"content": "ok"}, "finish_reason": "stop"}],
			"usage": {"prompt_tokens": 1, "completion_tokens": 1}
		}`)

		if _, err := newClient(t, WireOpenAI, server.URL).Complete(
			context.Background(), failure, Options{MaxTokens: 10},
		); err != nil {
			t.Fatalf("Complete: %v", err)
		}

		// This wire has no flag for it, so the failure has to be said in words
		// or the model reads it as the answer.
		messages, _ := recorded.body["messages"].([]any)
		message, _ := messages[0].(map[string]any)
		if message["content"] != "Error: no note by that name" {
			t.Errorf("content = %v", message["content"])
		}
	})
}

// No tools offered, no tools field. An endpoint that has never heard of tool
// calling is one of the things "OpenAI compatible" turns out to mean, and an
// empty array is not always read as "none".
func TestNoToolsMeansNoToolsField(t *testing.T) {
	for _, wire := range []Wire{WireAnthropic, WireOpenAI} {
		t.Run(string(wire), func(t *testing.T) {
			server, recorded := serve(t, http.StatusOK, `{
				"content": [{"type": "text", "text": "ok"}],
				"stop_reason": "end_turn", "usage": {"input_tokens": 1, "output_tokens": 1},
				"choices": [{"message": {"content": "ok"}, "finish_reason": "stop"}],
				"usage2": {}
			}`)

			if _, err := newClient(t, wire, server.URL).Complete(
				context.Background(), request(), Options{MaxTokens: 10},
			); err != nil {
				t.Fatalf("Complete: %v", err)
			}

			if _, present := recorded.body["tools"]; present {
				t.Errorf("sent a tools field with no tools offered")
			}
		})
	}
}
