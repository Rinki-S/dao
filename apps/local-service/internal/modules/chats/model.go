package chats

// Roles a stored turn can have.
//
// There is no system role. The system prompt belongs to the build that sent
// it, not to the transcript: storing one per conversation would let a chat
// started last month claim a prompt the current code no longer uses.
const (
	RoleUser      = "user"
	RoleAssistant = "assistant"
)

// What became of an assistant turn.
//
// StatusFailed does not mean empty. A stream that dies halfway leaves real
// text behind, and throwing it away would lose the answer while keeping the
// question — so the partial content is kept and marked for what it is.
const (
	StatusOK     = "ok"
	StatusFailed = "failed"
)

// Conversation is one thread of messages in a workspace.
type Conversation struct {
	ID          string `json:"id"`
	WorkspaceID string `json:"workspaceId"`
	Title       string `json:"title"`
	CreatedAt   string `json:"createdAt"`
	UpdatedAt   string `json:"updatedAt"`
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
}

// ConversationDetail is a conversation together with its turns, which is how
// the app always wants to read one.
type ConversationDetail struct {
	Conversation
	Messages []Message `json:"messages"`
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
