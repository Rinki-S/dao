// Package llm is a unified interface to language models.
//
// It is organised the way pi's packages/ai is: what varies between vendors is
// the *wire protocol*, not the vendor. Anthropic speaks one; OpenAI speaks
// another that xAI, Groq, OpenRouter, DeepSeek, LM Studio and Ollama's
// compatibility endpoint all speak too. Two wires therefore reach most of the
// field, and a vendor is only a base URL, a key and a model name pointed at
// one of them.
//
// Everything above this package works in the types below and never sees a
// vendor's own JSON.
package llm

import "encoding/json"

// Role is who a message came from.
//
// There are two, and a tool's output is not a third. It travels as content
// inside a user message, which is Anthropic's shape; the OpenAI wire wants a
// message of its own per result and expands it on the way out. Normalising on
// the richer of the two is what lets a single turn carry several results at
// once, which is exactly what a model asking for two tools in one breath
// produces — the other direction would have to invent an ordering.
type Role string

const (
	RoleUser      Role = "user"
	RoleAssistant Role = "assistant"
)

// ContentKind distinguishes the parts a message is built from. A message is a
// list of blocks rather than a string because a model's turn can mix prose,
// reasoning and tool calls, and the parts have to stay separable: reasoning is
// not shown the way an answer is, and a tool call is executed, not read.
type ContentKind string

const (
	KindText     ContentKind = "text"
	KindThinking ContentKind = "thinking"
	// KindToolCall is the model asking for a tool to be run. It comes back in
	// an assistant turn and is executed, never displayed as an answer.
	KindToolCall ContentKind = "tool_call"
	// KindToolResult is what running it produced, on its way back up.
	KindToolResult ContentKind = "tool_result"
)

// ContentBlock is one part of a message.
//
// Which fields mean anything depends on Kind, which is what a tagged union
// looks like in Go. Text carries prose for KindText, the model's working for
// KindThinking, and a tool's output for KindToolResult — the same field because
// in all three cases it is the words the block is made of.
type ContentBlock struct {
	Kind ContentKind `json:"kind"`
	Text string      `json:"text,omitempty"`

	// ID says which tool call the block is about: its own, on a call; the one
	// it answers, on a result. One field rather than two, because it is the
	// same join either way and a result that named a different call would be
	// meaningless.
	ID string `json:"id,omitempty"`

	// Name and Input belong to a call. Input is left as raw JSON: this package
	// has no idea what any tool's arguments look like, and decoding them into
	// a map only to encode them again would be a chance to lose a number's
	// precision for nothing.
	Name  string          `json:"name,omitempty"`
	Input json.RawMessage `json:"input,omitempty"`

	// IsError marks a result as a failure. It is sent as a result rather than
	// as an error because the model is the one that has to do something about
	// it — told that a file does not exist, a model asks for a different one;
	// handed nothing, it invents the contents.
	IsError bool `json:"isError,omitempty"`
}

func TextBlock(text string) ContentBlock {
	return ContentBlock{Kind: KindText, Text: text}
}

func ToolCallBlock(id, name string, input json.RawMessage) ContentBlock {
	return ContentBlock{Kind: KindToolCall, ID: id, Name: name, Input: input}
}

func ToolResultBlock(id, text string, isError bool) ContentBlock {
	return ContentBlock{Kind: KindToolResult, ID: id, Text: text, IsError: isError}
}

// ToolDefinition is a tool offered to the model.
//
// Schema is JSON Schema, which both wires want and neither validates for you.
// It is the entire description the model gets of what the arguments are, so it
// carries the weight that a function signature would in ordinary code.
type ToolDefinition struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Schema      json.RawMessage `json:"schema"`
}

type Message struct {
	Role    Role           `json:"role"`
	Content []ContentBlock `json:"content"`
}

func UserText(text string) Message {
	return Message{Role: RoleUser, Content: []ContentBlock{TextBlock(text)}}
}

// Context is everything the model is asked to answer from. It is a plain value
// with no behaviour attached, so it serialises to JSON as-is — which is what
// lets an execution trace record the exact input a run was given rather than a
// description of it.
type Context struct {
	SystemPrompt string    `json:"systemPrompt,omitempty"`
	Messages     []Message `json:"messages"`
}

// StopReason is why the model stopped, normalised across wires. Length matters
// to callers that parse structured output: a truncated answer is invalid JSON
// for a reason worth reporting differently from a model that simply wrote
// something malformed.
type StopReason string

const (
	StopEnd    StopReason = "stop"
	StopLength StopReason = "length"
	StopError  StopReason = "error"
	// StopToolUse is the model waiting for something to be run.
	//
	// Reported because it is what the provider said, but a loop should decide
	// by looking for the calls themselves: an endpoint can finish with "stop"
	// and hand back tool calls anyway, and a loop keyed on this string would
	// quietly drop them.
	StopToolUse StopReason = "tool_use"
)

// Usage is reported in tokens only. pi also carries a USD cost, which it can
// do because it ships a per-model rate card; Dao lets the user point at any
// endpoint with any model name, so there is no honest way to price a call here.
type Usage struct {
	InputTokens  int `json:"inputTokens"`
	OutputTokens int `json:"outputTokens"`
}

// Response is what came back. It is returned alongside an error rather than
// instead of one: a call that failed part-way still spent tokens, and the
// trace should record what it cost even when there is nothing usable to show.
type Response struct {
	Content    []ContentBlock `json:"content"`
	StopReason StopReason     `json:"stopReason"`
	Usage      Usage          `json:"usage"`
}

// Text is the assistant's prose with any reasoning left out — what a caller
// parsing structured output wants to hand to a JSON decoder.
func (r Response) Text() string {
	text := ""
	for _, block := range r.Content {
		if block.Kind == KindText {
			text += block.Text
		}
	}
	return text
}

// ToolCalls is what the model asked to have run, in the order it asked.
//
// Order is kept because a model that asks to read a file and then search it
// meant those in that order, and running them the other way round can produce
// an answer that is wrong without ever looking wrong.
func (r Response) ToolCalls() []ContentBlock {
	var calls []ContentBlock
	for _, block := range r.Content {
		if block.Kind == KindToolCall {
			calls = append(calls, block)
		}
	}
	return calls
}
