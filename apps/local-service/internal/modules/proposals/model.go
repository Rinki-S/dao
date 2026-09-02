// Package proposals keeps changes a model wants to make and has not made.
//
// A writing tool does not write. It works out exactly what the change would be,
// records it here, and stops. What a person is then shown, what they agree to,
// and what is finally written to the file are all the same row rather than
// three descriptions of it — which is the property that makes the confirmation
// mean anything. The summary run reaches the same conclusion from the other
// direction: a confirmation that trusts its own payload confirms nothing.
package proposals

// The writing tools, which is also how a proposal knows what it is showing.
// There is no diff to draw for a note being created, and no content to compare
// for one being renamed.
const (
	KindEditNote   = "edit_note"
	KindCreateNote = "create_note"
	KindEditTasks  = "edit_tasks"
	KindRenameNote = "rename_note"
	KindDeleteNote = "delete_note"
)

// Where a proposal has got to.
//
// Discarded covers two different things on purpose: a person saying no, and a
// person walking away. Sending another message abandons whatever was waiting,
// because a tool call left unanswered makes the whole transcript unreadable to
// the model — so there is no third state where a proposal is merely forgotten.
const (
	StatusPending   = "pending"
	StatusApplied   = "applied"
	StatusDiscarded = "discarded"
)

// Proposal is one change, waiting.
type Proposal struct {
	ID             string `json:"id"`
	WorkspaceID    string `json:"workspaceId"`
	ConversationID string `json:"conversationId"`

	// ToolCallID is the model's own id for the call that proposed this, and the
	// join to the transcript. Not a message id: the proposal is written while
	// the tool runs, and the assistant row it belongs to is not stored until the
	// turn ends. It is also the id the eventual tool result has to answer.
	ToolCallID string `json:"toolCallId"`

	Kind     string `json:"kind"`
	TargetID string `json:"targetId,omitempty"`
	Title    string `json:"title,omitempty"`

	// Before and After are what the file says now and what it would say. Both,
	// rather than a diff between them: applying writes After, the interface
	// shows the difference, and neither can drift from the other.
	Before string `json:"before"`
	After  string `json:"after"`

	// ExpectedUpdatedAt is what the note's updated_at said when this was worked
	// out. A proposal is a plan made against a file at a moment, and applying it
	// after the file has moved on would write over whatever happened in between.
	ExpectedUpdatedAt string `json:"-"`

	Status  string `json:"status"`
	Outcome string `json:"-"`

	CreatedAt  string  `json:"createdAt"`
	ResolvedAt *string `json:"resolvedAt,omitempty"`
}

// Pending reports whether this is still waiting on a person.
func (p Proposal) Pending() bool {
	return p.Status == StatusPending
}

// CreateRequest is a change a tool worked out but did not make.
type CreateRequest struct {
	WorkspaceID       string
	ConversationID    string
	ToolCallID        string
	Kind              string
	TargetID          string
	Title             string
	Before            string
	After             string
	ExpectedUpdatedAt string
}
