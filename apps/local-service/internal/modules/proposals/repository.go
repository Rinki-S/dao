package proposals

import (
	"database/sql"
	"errors"
	"time"

	"github.com/oklog/ulid/v2"
)

var (
	// ErrNotFound is an id that names no proposal.
	ErrNotFound = errors.New("no such proposal")

	// ErrAlreadyResolved is a proposal somebody has already answered.
	//
	// Its own error rather than a silent no-op, because the caller is about to
	// tell a model what happened, and "applied twice" and "applied once" are
	// different stories about the same file.
	ErrAlreadyResolved = errors.New("that change was already answered")
)

type Repository struct {
	db  *sql.DB
	now func() time.Time
}

func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db, now: time.Now}
}

const selectColumns = `
	id, workspace_id, conversation_id, tool_call_id, kind, target_id, title,
	before_text, after_text, expected_updated_at, status, outcome,
	created_at, resolved_at
`

func (r *Repository) Create(req CreateRequest) (Proposal, error) {
	proposal := Proposal{
		ID:                ulid.Make().String(),
		WorkspaceID:       req.WorkspaceID,
		ConversationID:    req.ConversationID,
		ToolCallID:        req.ToolCallID,
		Kind:              req.Kind,
		TargetID:          req.TargetID,
		Title:             req.Title,
		Before:            req.Before,
		After:             req.After,
		ExpectedUpdatedAt: req.ExpectedUpdatedAt,
		Status:            StatusPending,
		CreatedAt:         r.now().UTC().Format(time.RFC3339),
	}

	if _, err := r.db.Exec(`
		INSERT INTO proposals (
			id, workspace_id, conversation_id, tool_call_id, kind, target_id, title,
			before_text, after_text, expected_updated_at, status, outcome, created_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?)
	`,
		proposal.ID, proposal.WorkspaceID, proposal.ConversationID, proposal.ToolCallID,
		proposal.Kind, proposal.TargetID, proposal.Title, proposal.Before, proposal.After,
		proposal.ExpectedUpdatedAt, proposal.Status, proposal.CreatedAt,
	); err != nil {
		return Proposal{}, err
	}

	// With its comparison, like every other proposal this package hands out. A
	// row that came back one way from Create and another way from Get would be
	// the same trap the derived field exists to avoid.
	return proposal.WithDiff(), nil
}

func (r *Repository) Get(id string) (Proposal, error) {
	proposal, err := scan(r.db.QueryRow(`SELECT `+selectColumns+` FROM proposals WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return Proposal{}, ErrNotFound
	}

	return proposal, err
}

// ForConversation is every proposal a conversation has produced, oldest first.
//
// All of them rather than only the ones still waiting: a transcript shows what
// happened, and a change somebody applied last week is as much a part of that
// as one they have not answered yet.
func (r *Repository) ForConversation(conversationID string) ([]Proposal, error) {
	rows, err := r.db.Query(`
		SELECT `+selectColumns+` FROM proposals
		WHERE conversation_id = ?
		ORDER BY created_at, id
	`, conversationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	found := []Proposal{}

	for rows.Next() {
		proposal, err := scan(rows)
		if err != nil {
			return nil, err
		}
		found = append(found, proposal)
	}

	return found, rows.Err()
}

// Waiting is the proposal a conversation is stopped on, if it is stopped.
//
// At most one, and that is not an accident of the data: the loop stops the
// moment a tool proposes something, so a second cannot be reached until the
// first is answered. Returning one rather than a list says so.
func (r *Repository) Waiting(conversationID string) (Proposal, bool, error) {
	proposal, err := scan(r.db.QueryRow(`
		SELECT `+selectColumns+` FROM proposals
		WHERE conversation_id = ? AND status = ?
		ORDER BY created_at DESC, id DESC
		LIMIT 1
	`, conversationID, StatusPending))
	if errors.Is(err, sql.ErrNoRows) {
		return Proposal{}, false, nil
	}
	if err != nil {
		return Proposal{}, false, err
	}

	return proposal, true, nil
}

// Resolve records what became of a proposal and what the model will be told.
//
// The status is set with the outcome in one statement, and only from pending,
// so two answers racing each other cannot both win. The second gets
// ErrAlreadyResolved and the caller can tell a true story about the file.
func (r *Repository) Resolve(id string, status string, outcome string) (Proposal, error) {
	now := r.now().UTC().Format(time.RFC3339)

	result, err := r.db.Exec(`
		UPDATE proposals
		SET status = ?, outcome = ?, resolved_at = ?
		WHERE id = ? AND status = ?
	`, status, outcome, now, id, StatusPending)
	if err != nil {
		return Proposal{}, err
	}

	changed, err := result.RowsAffected()
	if err != nil {
		return Proposal{}, err
	}

	if changed == 0 {
		// Nothing moved: either there is no such proposal or it was already
		// answered. Reading it back is what tells those apart.
		if _, err := r.Get(id); err != nil {
			return Proposal{}, err
		}

		return Proposal{}, ErrAlreadyResolved
	}

	return r.Get(id)
}

// DiscardWaiting abandons whatever a conversation was stopped on.
//
// Called when somebody sends another message instead of answering. Not a
// tidying-up: a tool call with no result makes the transcript unreadable to the
// model, so the next turn would fail on the wire because of a decision the
// person declined to make. Abandoning it is what keeps the conversation usable,
// and the outcome says plainly that nothing was written.
func (r *Repository) DiscardWaiting(conversationID string, outcome string) (Proposal, bool, error) {
	waiting, found, err := r.Waiting(conversationID)
	if err != nil || !found {
		return Proposal{}, false, err
	}

	resolved, err := r.Resolve(waiting.ID, StatusDiscarded, outcome)
	if err != nil {
		return Proposal{}, false, err
	}

	return resolved, true, nil
}

type scanner interface {
	Scan(dest ...any) error
}

// scan reads one row, and is the only way a proposal leaves this package. The
// comparison is worked out here for that reason: every caller gets it, and no
// caller has to remember to ask.
func scan(row scanner) (Proposal, error) {
	var proposal Proposal

	if err := row.Scan(
		&proposal.ID,
		&proposal.WorkspaceID,
		&proposal.ConversationID,
		&proposal.ToolCallID,
		&proposal.Kind,
		&proposal.TargetID,
		&proposal.Title,
		&proposal.Before,
		&proposal.After,
		&proposal.ExpectedUpdatedAt,
		&proposal.Status,
		&proposal.Outcome,
		&proposal.CreatedAt,
		&proposal.ResolvedAt,
	); err != nil {
		return Proposal{}, err
	}

	return proposal.WithDiff(), nil
}
