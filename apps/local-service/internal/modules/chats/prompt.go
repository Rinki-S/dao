package chats

import (
	"github.com/rinki-s/dao/apps/local-service/internal/ai/llm"
)

// Bump whenever the prompt below changes, for the same reason the summary
// prompt is versioned: a transcript read back later should not appear to have
// been produced by wording the build no longer uses.
const ChatPromptVersion = "1"

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
- You cannot read their notes or tasks in this conversation. If an answer would need them, say so rather than guessing at what they contain.
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
func BuildContext(messages []Message) llm.Context {
	request := llm.Context{SystemPrompt: chatSystemPrompt}

	for _, message := range messages {
		if message.Content == "" {
			continue
		}

		request.Messages = append(request.Messages, llm.Message{
			Role:    llm.Role(message.Role),
			Content: []llm.ContentBlock{llm.TextBlock(message.Content)},
		})
	}

	return request
}
