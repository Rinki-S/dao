package proposals

import (
	"database/sql"
	"errors"
	"slices"
	"testing"

	_ "modernc.org/sqlite"

	"github.com/rinki-s/dao/apps/local-service/internal/diff"
)

func openTestDB(t *testing.T) *sql.DB {
	t.Helper()

	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { db.Close() })

	if _, err := db.Exec(`
		CREATE TABLE chat_conversations (
			id TEXT PRIMARY KEY,
			workspace_id TEXT NOT NULL,
			title TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);

		CREATE TABLE proposals (
			id TEXT PRIMARY KEY,
			workspace_id TEXT NOT NULL,
			conversation_id TEXT NOT NULL
				REFERENCES chat_conversations(id) ON DELETE CASCADE,
			tool_call_id TEXT NOT NULL,
			kind TEXT NOT NULL,
			target_id TEXT NOT NULL DEFAULT '',
			title TEXT NOT NULL DEFAULT '',
			before_text TEXT NOT NULL DEFAULT '',
			after_text TEXT NOT NULL DEFAULT '',
			expected_updated_at TEXT NOT NULL DEFAULT '',
			status TEXT NOT NULL DEFAULT 'pending',
			outcome TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL,
			resolved_at TEXT,
			UNIQUE (conversation_id, tool_call_id)
		);
	`); err != nil {
		t.Fatalf("create schema: %v", err)
	}

	if _, err := db.Exec(`
		INSERT INTO chat_conversations (id, workspace_id, title, created_at, updated_at)
		VALUES ('chat-1', 'workspace-1', 'Ports', '2026-09-02T10:00:00Z', '2026-09-02T10:00:00Z')
	`); err != nil {
		t.Fatalf("insert conversation: %v", err)
	}

	return db
}

func anEdit(callID string) CreateRequest {
	return CreateRequest{
		WorkspaceID:       "workspace-1",
		ConversationID:    "chat-1",
		ToolCallID:        callID,
		Kind:              KindEditNote,
		TargetID:          "note-1",
		Before:            "Listens on 8080.",
		After:             "Listens on 7743.",
		ExpectedUpdatedAt: "2026-09-02T09:00:00Z",
	}
}

func TestAProposalStartsWaiting(t *testing.T) {
	repo := NewRepository(openTestDB(t))

	created, err := repo.Create(anEdit("call-1"))
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	if !created.Pending() {
		t.Errorf("a new proposal is %q", created.Status)
	}

	// Both texts, so that applying and showing read the same row rather than
	// two descriptions of one change.
	read, err := repo.Get(created.ID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if read.Before != "Listens on 8080." || read.After != "Listens on 7743." {
		t.Errorf("stored %+v", read)
	}
	if read.ExpectedUpdatedAt != "2026-09-02T09:00:00Z" {
		t.Errorf("the expectation was not kept: %q", read.ExpectedUpdatedAt)
	}
}

// The loop stops the moment a tool proposes something, so a second proposal
// cannot be reached until the first is answered.
func TestOnlyOneChangeWaitsAtATime(t *testing.T) {
	repo := NewRepository(openTestDB(t))

	first, err := repo.Create(anEdit("call-1"))
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	waiting, found, err := repo.Waiting("chat-1")
	if err != nil || !found {
		t.Fatalf("Waiting: %+v found=%v err=%v", waiting, found, err)
	}
	if waiting.ID != first.ID {
		t.Errorf("waiting on %q, want %q", waiting.ID, first.ID)
	}

	if _, err := repo.Resolve(first.ID, StatusApplied, "written"); err != nil {
		t.Fatalf("Resolve: %v", err)
	}

	if _, found, _ := repo.Waiting("chat-1"); found {
		t.Error("still waiting after the change was answered")
	}
}

// "Applied twice" and "applied once" are different stories about one file, and
// the model is about to be told one of them.
func TestAChangeCannotBeAnsweredTwice(t *testing.T) {
	repo := NewRepository(openTestDB(t))

	created, _ := repo.Create(anEdit("call-1"))

	if _, err := repo.Resolve(created.ID, StatusApplied, "written"); err != nil {
		t.Fatalf("first Resolve: %v", err)
	}

	_, err := repo.Resolve(created.ID, StatusDiscarded, "changed my mind")
	if !errors.Is(err, ErrAlreadyResolved) {
		t.Errorf("second Resolve err = %v, want ErrAlreadyResolved", err)
	}

	// And it stays what it was, rather than taking the second answer.
	read, _ := repo.Get(created.ID)
	if read.Status != StatusApplied {
		t.Errorf("status = %q after a second answer", read.Status)
	}
}

func TestAnUnknownProposalIsNotFound(t *testing.T) {
	repo := NewRepository(openTestDB(t))

	if _, err := repo.Get("nothing"); !errors.Is(err, ErrNotFound) {
		t.Errorf("Get err = %v, want ErrNotFound", err)
	}
	if _, err := repo.Resolve("nothing", StatusApplied, ""); !errors.Is(err, ErrNotFound) {
		t.Errorf("Resolve err = %v, want ErrNotFound", err)
	}
}

// Sending another message instead of answering abandons what was waiting. Not
// tidying-up: a tool call with no result makes the transcript unreadable to the
// model, so the next turn would fail on the wire over a decision somebody
// declined to make.
func TestWalkingAwayAbandonsTheChange(t *testing.T) {
	repo := NewRepository(openTestDB(t))

	created, _ := repo.Create(anEdit("call-1"))

	abandoned, found, err := repo.DiscardWaiting("chat-1", "nothing was written")
	if err != nil || !found {
		t.Fatalf("DiscardWaiting: found=%v err=%v", found, err)
	}
	if abandoned.ID != created.ID || abandoned.Status != StatusDiscarded {
		t.Errorf("abandoned %+v", abandoned)
	}
	if abandoned.Outcome != "nothing was written" {
		t.Errorf("outcome = %q", abandoned.Outcome)
	}
	if abandoned.ResolvedAt == nil {
		t.Error("resolved_at was not set")
	}
}

func TestWalkingAwayWithNothingWaitingIsFine(t *testing.T) {
	repo := NewRepository(openTestDB(t))

	_, found, err := repo.DiscardWaiting("chat-1", "nothing was written")
	if err != nil {
		t.Fatalf("DiscardWaiting: %v", err)
	}
	if found {
		t.Error("abandoned something that was not there")
	}
}

// A transcript shows what happened, and a change somebody applied is as much a
// part of that as one they have not answered yet.
func TestAConversationKeepsTheChangesItAlreadyAnswered(t *testing.T) {
	repo := NewRepository(openTestDB(t))

	first, _ := repo.Create(anEdit("call-1"))
	if _, err := repo.Resolve(first.ID, StatusApplied, "written"); err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	second, _ := repo.Create(anEdit("call-2"))

	all, err := repo.ForConversation("chat-1")
	if err != nil {
		t.Fatalf("ForConversation: %v", err)
	}
	if len(all) != 2 {
		t.Fatalf("got %d proposals, want both", len(all))
	}
	if all[0].ID != first.ID || all[1].ID != second.ID {
		t.Errorf("out of order: %q then %q", all[0].ID, all[1].ID)
	}
}

// One call proposes one change. A tool that recorded two against the same call
// would leave the transcript with a result that answers an ambiguous question.
func TestOneCallProposesOneChange(t *testing.T) {
	repo := NewRepository(openTestDB(t))

	if _, err := repo.Create(anEdit("call-1")); err != nil {
		t.Fatalf("Create: %v", err)
	}
	if _, err := repo.Create(anEdit("call-1")); err == nil {
		t.Error("one call proposed two changes")
	}
}

// The comparison is worked out here, not by whatever is drawing it.
//
// A second implementation in the renderer is how the picture somebody agreed to
// stops being the change that gets written — so every way a proposal comes back
// out carries the same lines, computed by the same code.
func TestAProposalComesBackWithItsComparison(t *testing.T) {
	repo := NewRepository(openTestDB(t))

	created, err := repo.Create(anEdit("call-1"))
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	read, err := repo.Get(created.ID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}

	waiting, found, err := repo.Waiting("chat-1")
	if err != nil || !found {
		t.Fatalf("Waiting: found=%v err=%v", found, err)
	}

	all, err := repo.ForConversation("chat-1")
	if err != nil {
		t.Fatalf("ForConversation: %v", err)
	}

	want := []diff.Line{
		{Op: diff.Remove, Text: "Listens on 8080."},
		{Op: diff.Add, Text: "Listens on 7743."},
	}

	for name, got := range map[string][]diff.Line{
		"Create":          created.Diff,
		"Get":             read.Diff,
		"Waiting":         waiting.Diff,
		"ForConversation": all[0].Diff,
	} {
		if !slices.Equal(got, want) {
			t.Errorf("%s gave %+v, want %+v", name, got, want)
		}
	}
}
