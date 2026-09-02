package chats

import (
	"testing"

	"github.com/rinki-s/dao/apps/local-service/internal/ai/llm"
)

// Both wires reject a tool call with no answer to it, so the pairing is the
// whole point: a call and its result travel together or neither goes.
func TestATurnThatUsedToolsIsRebuiltWithItsResults(t *testing.T) {
	context := BuildContext([]Message{
		{Role: "user", Content: "what port does kestrel use?"},
		{
			Role:    "assistant",
			Content: "Let me look.",
			ToolCalls: []ToolCall{
				{ID: "call-1", Name: "read_note", Input: `{"noteId":"n1"}`, Output: "port 7743", Status: ToolCallOK},
			},
		},
		{Role: "assistant", Content: "7743."},
	})

	// user, assistant(text + call), user(result), assistant
	if len(context.Messages) != 4 {
		t.Fatalf("got %d messages: %+v", len(context.Messages), context.Messages)
	}

	call := context.Messages[1]
	if call.Role != llm.RoleAssistant || len(call.Content) != 2 {
		t.Fatalf("the call turn is %+v", call)
	}
	if call.Content[0].Kind != llm.KindText || call.Content[0].Text != "Let me look." {
		t.Errorf("prose block = %+v", call.Content[0])
	}
	if call.Content[1].Kind != llm.KindToolCall || call.Content[1].ID != "call-1" {
		t.Errorf("call block = %+v", call.Content[1])
	}

	// The results come back as a user turn, which is what both wires call the
	// side of the conversation that is not the model.
	result := context.Messages[2]
	if result.Role != llm.RoleUser || len(result.Content) != 1 {
		t.Fatalf("the result turn is %+v", result)
	}
	if result.Content[0].Kind != llm.KindToolResult || result.Content[0].ID != "call-1" {
		t.Errorf("result block = %+v", result.Content[0])
	}
	if result.Content[0].Text != "port 7743" {
		t.Errorf("result text = %q", result.Content[0].Text)
	}
}

// A tool that could not do its job told the model so, and the next turn has to
// say the same thing — otherwise the model reads a failure as an answer.
func TestAFailedCallIsReplayedAsAFailure(t *testing.T) {
	context := BuildContext([]Message{
		{Role: "user", Content: "read note 9"},
		{
			Role: "assistant",
			ToolCalls: []ToolCall{
				{ID: "call-1", Name: "read_note", Input: `{"noteId":"n9"}`, Output: "no such note", Status: ToolCallFailed},
			},
		},
	})

	result := context.Messages[len(context.Messages)-1]
	if !result.Content[0].IsError {
		t.Errorf("a failed call was replayed as a success: %+v", result.Content[0])
	}
}

// A call still waiting on a person has no result yet. Sending it would hand the
// model half of an exchange, which the wire refuses.
func TestACallStillWaitingOnSomebodyIsNotSent(t *testing.T) {
	context := BuildContext([]Message{
		{Role: "user", Content: "fix the port"},
		{
			Role:    "assistant",
			Content: "I can change that.",
			ToolCalls: []ToolCall{
				{ID: "call-1", Name: "edit_note", Input: `{}`, Status: ToolCallPending},
			},
		},
	})

	// The prose survives — the model did say it. Only the unanswerable half is
	// left out.
	if len(context.Messages) != 2 {
		t.Fatalf("got %d messages: %+v", len(context.Messages), context.Messages)
	}
	if len(context.Messages[1].Content) != 1 || context.Messages[1].Content[0].Kind != llm.KindText {
		t.Errorf("the pending call was sent anyway: %+v", context.Messages[1])
	}
}

// Conversations recorded before results were kept still have to be readable.
// Their calls have no id and no output, so there is nothing to pair — inventing
// one would answer a call that was never made.
func TestATurnRecordedBeforeResultsWereKeptStillReplays(t *testing.T) {
	context := BuildContext([]Message{
		{Role: "user", Content: "what did I write?"},
		{
			Role:      "assistant",
			Content:   "You wrote about parsers.",
			ToolCalls: []ToolCall{{Name: "search_notes", Input: `{"query":"parser"}`}},
		},
	})

	if len(context.Messages) != 2 {
		t.Fatalf("got %d messages: %+v", len(context.Messages), context.Messages)
	}
	if len(context.Messages[1].Content) != 1 {
		t.Errorf("an unanswerable call was sent: %+v", context.Messages[1])
	}
}

// The assistant row written before a stream that failed with nothing to show.
// The Anthropic wire rejects a message whose text block is empty, so sending
// one would fail the next turn because an earlier one failed.
func TestAnEmptyTurnIsLeftOut(t *testing.T) {
	context := BuildContext([]Message{
		{Role: "user", Content: "hello"},
		{Role: "assistant", Content: ""},
	})

	if len(context.Messages) != 1 {
		t.Fatalf("got %d messages: %+v", len(context.Messages), context.Messages)
	}
}

// A turn whose prose never arrived but whose tools ran is not empty. It is the
// record of what the model looked up, and dropping it takes that away from the
// next turn.
func TestATurnWithNoProseButAnsweredCallsIsKept(t *testing.T) {
	context := BuildContext([]Message{
		{Role: "user", Content: "look it up"},
		{
			Role:      "assistant",
			ToolCalls: []ToolCall{{ID: "call-1", Name: "read_tasks", Input: `{}`, Output: "- [ ] ship", Status: ToolCallOK}},
		},
	})

	if len(context.Messages) != 3 {
		t.Fatalf("got %d messages: %+v", len(context.Messages), context.Messages)
	}
	if len(context.Messages[1].Content) != 1 || context.Messages[1].Content[0].Kind != llm.KindToolCall {
		t.Errorf("the call turn is %+v", context.Messages[1])
	}
}
