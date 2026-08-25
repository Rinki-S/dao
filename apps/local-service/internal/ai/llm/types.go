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

// Role is who a message came from. ToolResult has no use yet — tool calling is
// deferred — but the vocabulary is fixed now so adding it later does not
// reshape stored contexts.
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
)

type ContentBlock struct {
	Kind ContentKind `json:"kind"`
	Text string      `json:"text"`
}

func TextBlock(text string) ContentBlock {
	return ContentBlock{Kind: KindText, Text: text}
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
