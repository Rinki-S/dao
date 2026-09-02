package chats

import (
	"encoding/json"

	"github.com/rinki-s/dao/apps/local-service/internal/ai/llm"
)

// Bump whenever the prompt below changes, for the same reason the summary
// prompt is versioned: a transcript read back later should not appear to have
// been produced by wording the build no longer uses.
//
// 2: the model can reach the workspace's notes and tasks.
// 3: a turn's tool calls and their results are replayed to the model, so it
// sees what it looked up on earlier turns rather than only what it then said.
const ChatPromptVersion = "3"

// The prompt lives with the chat feature rather than in ai/harness.
//
// A harness run is one shot: it gathers a fixed context, asks once, validates
// the answer against a schema, and records a trace. A chat is none of those —
// the context is whatever the user has said so far, there is no schema to
// validate against, and the transcript is its own record. Putting it under
// harness would mean sharing machinery with nothing in common but a model call.
const chatSystemPrompt = `You are the assistant inside Dao, a local-first workspace where someone keeps their own notes and tasks.

You are talking to the person whose workspace this is.

Rules:
- Answer the question asked. Do not pad, praise, or restate the question back.
- Say plainly when you do not know something.
- You have tools for reading this workspace. Use them when the answer depends on what is actually written there, rather than answering from the conversation alone.
- Never describe the contents of a note you have not read. If a search returns only titles and excerpts, that is what you know about those notes.
- If the tools find nothing, say so. Do not fill the gap with what the note probably said.
- Format with Markdown when it helps: code in fenced blocks, lists when there is a list.`

// chatMaxTokens caps one reply.
//
// Higher than the summary's ceiling, and for a different reason. There the
// limit protected a schema: a truncated answer is invalid JSON. Here nothing
// breaks if a reply is cut off, but a misconfigured local model can stream
// until something stops it, and the thing that stops it should be a number
// chosen here rather than the user closing the window.
const chatMaxTokens = 4096

// BuildContext turns a stored transcript into a request.
//
// Empty turns are left out. The obvious candidate is the assistant row written
// before a stream that then failed with nothing to show, and it is not merely
// noise: the Anthropic wire rejects a message whose text block is empty, so
// sending one would fail the next turn because an earlier one failed.
//
// An assistant turn that used tools is rebuilt as the model originally said it
// — its prose and its calls in one turn — followed by a turn carrying the
// results. That pairing is not decoration. Both wires reject a tool call with
// no answer to it, so a call and its result travel together or neither goes.
//
// Which is why calls the app cannot vouch for are dropped rather than patched
// up: one recorded before results were kept has no output to give, and one
// still waiting on a person has no output yet. Their prose stays, because the
// model did say it. Only the unanswerable half is left out.
func BuildContext(messages []Message) llm.Context {
	request := llm.Context{SystemPrompt: chatSystemPrompt}

	for _, message := range messages {
		answered := answeredCalls(message)

		if message.Content == "" && len(answered) == 0 {
			continue
		}

		content := []llm.ContentBlock{}
		if message.Content != "" {
			content = append(content, llm.TextBlock(message.Content))
		}
		for _, call := range answered {
			content = append(content, llm.ToolCallBlock(call.ID, call.Name, json.RawMessage(call.Input)))
		}

		request.Messages = append(request.Messages, llm.Message{
			Role:    llm.Role(message.Role),
			Content: content,
		})

		if len(answered) == 0 {
			continue
		}

		// The results come back as a user turn, which is what both wires call
		// the side of the conversation that is not the model — even when what
		// it is saying is a tool's output rather than a person's words.
		results := make([]llm.ContentBlock, 0, len(answered))
		for _, call := range answered {
			results = append(results, llm.ToolResultBlock(call.ID, call.Output, call.Status == ToolCallFailed))
		}

		request.Messages = append(request.Messages, llm.Message{
			Role:    llm.RoleUser,
			Content: results,
		})
	}

	return request
}

func answeredCalls(message Message) []ToolCall {
	if message.Role != string(llm.RoleAssistant) {
		return nil
	}

	answered := make([]ToolCall, 0, len(message.ToolCalls))
	for _, call := range message.ToolCalls {
		if call.Answered() {
			answered = append(answered, call)
		}
	}

	return answered
}
