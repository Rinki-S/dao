// Package proposals keeps changes a model wants to make and has not made.
//
// A writing tool does not write. It works out exactly what the change would be,
// records it here, and stops. What a person is then shown, what they agree to,
// and what is finally written to the file are all the same row rather than
// three descriptions of it — which is the property that makes the confirmation
// mean anything. The summary run reaches the same conclusion from the other
// direction: a confirmation that trusts its own payload confirms nothing.
package proposals

import "github.com/rinki-s/dao/apps/local-service/internal/diff"

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
//
// Failed is separate from both, and from applied. Somebody agreed and the write
// did not happen — because the note moved on in between, most often. Recording
// that as applied would leave a row asserting a change to a file that does not
// contain it, and everything downstream reads the row: the model is told the
// truth by the code that tried, but a person coming back tomorrow has only this.
const (
	StatusPending   = "pending"
	StatusApplied   = "applied"
	StatusDiscarded = "discarded"
	StatusFailed    = "failed"
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

	// Diff is the comparison between those two, by line.
	//
	// Derived, not stored: it is a function of Before and After, and a copy of
	// it in a column would be a second thing that could disagree with the pair
	// it was computed from. Filled in wherever a proposal comes back out of the
	// database, so a surface never has to work it out for itself — a second
	// implementation in another language is the way the picture somebody agreed
	// to stops being the change that gets written.
	Diff []diff.Line `json:"diff"`

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

// WithDiff is the proposal with its comparison worked out.
//
// Called on the way out of the database rather than on the way in, so that a
// row written before this existed is drawn the same way as one written after.
func (p Proposal) WithDiff() Proposal {
	p.Diff = diff.Lines(p.Before, p.After)

	return p
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
