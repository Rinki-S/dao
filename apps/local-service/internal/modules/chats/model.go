package chats

import "github.com/rinki-s/dao/apps/local-service/internal/modules/proposals"

// Roles a stored turn can have.
//
// There is no system role. The system prompt belongs to the build that sent
// it, not to the transcript: storing one per conversation would let a chat
// started last month claim a prompt the current code no longer uses.
const (
	RoleUser      = "user"
	RoleAssistant = "assistant"
)

// SearchEntityType is what a conversation is called in the search index. One
// name, used by the thing that writes the entry and by the thing that decides
// where a hit opens.
const SearchEntityType = "chat"

// What became of an assistant turn.
//
// StatusFailed does not mean empty. A stream that dies halfway leaves real
// text behind, and throwing it away would lose the answer while keeping the
// question — so the partial content is kept and marked for what it is.
const (
	StatusOK     = "ok"
	StatusFailed = "failed"
	// StatusStopped is a reply the reader ended on purpose.
	//
	// Separate from failed because nothing went wrong. The text that arrived is
	// kept either way, but a transcript that called this a failure would be
	// blaming the model for a decision the user made — and the difference is
	// exactly what someone reading the conversation back needs to know.
	StatusStopped = "stopped"
)

// Conversation is one thread of messages in a workspace.
type Conversation struct {
	ID          string `json:"id"`
	WorkspaceID string `json:"workspaceId"`
	Title       string `json:"title"`
	CreatedAt   string `json:"createdAt"`
	UpdatedAt   string `json:"updatedAt"`
}

// What became of a call. Empty means a call recorded before this app kept
// track, which is treated as having succeeded — it is what the reader was shown
// at the time, and there is nothing else to go on.
const (
	ToolCallOK      = "ok"
	ToolCallFailed  = "failed"
	ToolCallPending = "pending"
)

// ToolCall is one thing the model did before it answered.
//
// The arguments are kept beside the name because "searched your notes" and
// "searched your notes for parser" are different claims, and only the second is
// one the reader can check.
//
// It carries the result and the model's own id for the call as well, which it
// did not use to. Those are not for the reader — nobody wants to look at a tool
// call's id — they are what lets the transcript be read back *to the model*.
// Without them a stored conversation can only be replayed as prose, and a model
// that is handed its own half-finished tool call with no answer to it is handed
// something the wire rejects outright.
type ToolCall struct {
	// ID is the model's identifier for this call. Empty on calls recorded
	// before this was kept, which is why replay skips them rather than
	// inventing one: a fabricated id pairs a result with a call that was never
	// made.
	ID    string `json:"id,omitempty"`
	Name  string `json:"name"`
	Input string `json:"input"`

	// Output is what the tool said, which is what the model was told. Kept
	// because on the next turn it is the only record of what the model knows.
	Output string `json:"output,omitempty"`

	// Status is ok, failed, or pending. Pending is a call waiting on a person:
	// the tool proposed something rather than doing it, and until that is
	// answered the call has no result to replay.
	Status string `json:"status,omitempty"`
}

// Answered reports whether this call can be replayed to a model. A call with no
// id cannot be paired with its result, and a pending one has no result yet;
// either way the pair is left out rather than sent half-formed.
func (c ToolCall) Answered() bool {
	return c.ID != "" && c.Status != ToolCallPending
}

// Message is one turn.
//
// Model and Wire are per message rather than per conversation because the user
// can change provider between turns. A transcript that claimed one model wrote
// all of it would be a record of something that did not happen.
type Message struct {
	ID             string `json:"id"`
	ConversationID string `json:"conversationId"`
	Role           string `json:"role"`
	Content        string `json:"content"`
	Position       int    `json:"position"`
	Model          string `json:"model,omitempty"`
	Wire           string `json:"wire,omitempty"`
	InputTokens    int    `json:"inputTokens,omitempty"`
	OutputTokens   int    `json:"outputTokens,omitempty"`
	Status         string `json:"status"`
	ErrorMessage   string `json:"errorMessage,omitempty"`
	CreatedAt      string `json:"createdAt"`

	// ToolCalls is what the model did before answering, in order. Stored with
	// the turn so that reloading a conversation still shows how its answers
	// were arrived at, rather than only what they were.
	ToolCalls []ToolCall `json:"toolCalls,omitempty"`

	// Steps is how many times the model was asked to produce this turn.
	//
	// Kept because a turn can be picked up again after a proposed change is
	// answered, and each continuation is a fresh run with a fresh bound. Without
	// a record of what the earlier runs spent, propose-apply-propose-apply is a
	// loop with no end that costs money on every lap.
	//
	// Sent with the rest even though nothing displays it. The stream's terminal
	// event carries the stored row so that what the client holds is what a
	// reload shows, and a field held back would make that true only of the
	// fields somebody remembered to include.
	Steps int `json:"steps"`
}

// ConversationDetail is a conversation together with its turns, which is how
// the app always wants to read one.
//
// And with the changes it proposed. A change the model prepared belongs to the
// conversation as much as the words around it do — it is shown in the thread,
// answered in the thread, and one of them may be the thing the conversation is
// currently stopped on. Fetched separately it would be a second request whose
// answer could disagree with the first.
type ConversationDetail struct {
	Conversation
	Messages  []Message            `json:"messages"`
	Proposals []proposals.Proposal `json:"proposals"`
}

type CreateConversationRequest struct {
	WorkspaceID string `json:"workspaceId"`
	Title       string `json:"title"`
}

type RenameConversationRequest struct {
	Title string `json:"title"`
}

// SendMessageRequest is one turn from the user. The reply is not part of it:
// it arrives over the stream the request opens.
type SendMessageRequest struct {
	Content string `json:"content"`
}

// The events a turn's stream can carry.
//
// Every stream that opens ends with done, whether the reply succeeded or not,
// and done carries the assistant row exactly as it was stored. That is the
// property worth having: what the client shows after done is what a reload
// would show, so a failure needs no separate rendering path invented for it.
//
// Proposal keeps that property rather than breaking it. A change the model
// prepared is part of the conversation's state, so it is stored and comes back
// on a reload with everything else — this only saves the client from having to
// go and ask for what it was just told.
const (
	EventStart    = "start"
	EventDelta    = "delta"
	EventTool     = "tool"
	EventProposal = "proposal"
	EventDone     = "done"
)

// ToolEvent says that the model is looking something up.
//
// Sent when a tool starts rather than when it finishes, because the point of it
// is to fill the pause: a reader watching nothing happen for two seconds should
// be told what is happening, not told afterwards what happened.
//
// It carries the name and the arguments and no phrasing. How to say "searched
// your notes for parser" is the renderer's business, where the rest of the
// product's words live.
type ToolEvent struct {
	Name  string `json:"name"`
	Input string `json:"input"`
}

// StartEvent opens the stream. The user's turn comes back because the server
// assigned its id, position and timestamp, and the assistant's id comes back so
// the client has somewhere to put the deltas that follow.
//
// A pointer, because a turn picked up after somebody answered a proposed change
// begins with nobody having said anything. A zero Message here would go out as
// a turn with no role and no content, which the client would have to recognise
// as meaning absent — and a field that is missing says that already.
type StartEvent struct {
	UserMessage        *Message `json:"userMessage,omitempty"`
	AssistantMessageID string   `json:"assistantMessageId"`
}

// DeltaEvent is one piece of the reply as it arrives.
type DeltaEvent struct {
	Text string `json:"text"`
}
