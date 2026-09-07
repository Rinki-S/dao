package harness

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	_ "modernc.org/sqlite"
)

func TestRenderDayKeepsToTheBudget(t *testing.T) {
	// Thirty notes is more than the budget allows, and the summary must say so
	// rather than quietly stand for a day it only half read.
	day := Day{Date: "2026-08-25"}
	for i := range 30 {
		day.Notes = append(day.Notes, TouchedNote{
			Title:   fmt.Sprintf("Note %d", i),
			Content: "something happened",
		})
	}

	rendered, included := RenderDay(day)

	if included.Notes != maxNotes {
		t.Errorf("Notes = %d, want %d", included.Notes, maxNotes)
	}
	if included.NotesDropped != 30-maxNotes {
		t.Errorf("NotesDropped = %d, want %d", included.NotesDropped, 30-maxNotes)
	}
	if !included.Truncated {
		t.Error("Truncated = false after dropping notes")
	}
	if strings.Contains(rendered, "Note 20") {
		t.Error("a note past the cap reached the context")
	}
}

func TestRenderDayTakesNotesInTheOrderGiven(t *testing.T) {
	// The gatherer hands them over newest first, and the cap has to keep that
	// end — the thing worth summarising is usually the thing last touched.
	day := Day{Date: "2026-08-25"}
	for i := range maxNotes + 3 {
		day.Notes = append(day.Notes, TouchedNote{
			Title:   fmt.Sprintf("Note %d", i),
			Content: "x",
		})
	}

	rendered, _ := RenderDay(day)

	if !strings.Contains(rendered, "Note 0") {
		t.Error("the newest note was dropped")
	}
}

func TestRenderDayClipsALongNote(t *testing.T) {
	day := Day{
		Date:  "2026-08-25",
		Notes: []TouchedNote{{Title: "Long", Content: strings.Repeat("a", maxNoteChars*2)}},
	}

	rendered, included := RenderDay(day)

	if !included.Truncated {
		t.Error("Truncated = false after clipping a note")
	}
	if len(rendered) > maxTotalChars+500 {
		t.Errorf("rendered %d chars, past the budget", len(rendered))
	}
}

func TestClipDoesNotSplitARune(t *testing.T) {
	// Cutting mid-rune turns the tail into a replacement character, which is
	// then sent to the model as if the user had written it.
	text := strings.Repeat("道", 100)

	clipped, wasClipped := clip(text, 10)

	if !wasClipped {
		t.Fatal("wasClipped = false")
	}
	if strings.ContainsRune(clipped, '�') {
		t.Errorf("clip split a rune: %q", clipped)
	}
	if !strings.HasPrefix(text, clipped) {
		t.Error("the clipped text is not a prefix of the original")
	}
}

func TestRenderDayWithNothingInIt(t *testing.T) {
	_, included := RenderDay(Day{Date: "2026-08-25"})

	// A day with nothing in it should be reported as such, not summarised.
	if !included.Empty() {
		t.Errorf("Empty() = false for %+v", included)
	}
}

func TestRenderDayIncludesTheTaskList(t *testing.T) {
	day := Day{
		Date:         "2026-08-25",
		Tasks:        "- [x] Ship the parser fix\n- [ ] Write the notes",
		TasksTouched: true,
	}

	rendered, included := RenderDay(day)

	if !included.TasksIncluded {
		t.Error("TasksIncluded = false")
	}
	if !strings.Contains(rendered, "Ship the parser fix") {
		t.Error("the task list did not reach the context")
	}
}

func TestRenderDayLeavesAnUntouchedTaskListOut(t *testing.T) {
	// Every workspace has a task file. Sending it on a day nobody opened it
	// would break the promise that only what the day touched goes.
	_, included := RenderDay(Day{
		Date:         "2026-08-25",
		Tasks:        "- [ ] Something from last week",
		TasksTouched: false,
	})

	if included.TasksIncluded {
		t.Error("an untouched task list was included")
	}
}

func TestStartOfDayIsLocal(t *testing.T) {
	// A summary asked for at 00:30 is about the day the user thinks they are
	// in, not the one UTC is in.
	zone := time.FixedZone("UTC+8", 8*60*60)
	start := StartOfDay(time.Date(2026, 8, 25, 0, 30, 0, 0, zone))

	if start.Format("2006-01-02 15:04") != "2026-08-25 00:00" {
		t.Errorf("StartOfDay = %v", start)
	}
}

// --- gathering ---

func openGatherTestDB(t *testing.T) *sql.DB {
	t.Helper()

	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "gather-test.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { db.Close() })

	if _, err := db.Exec(`
		CREATE TABLE notes (
			id TEXT PRIMARY KEY,
			workspace_id TEXT NOT NULL,
			title TEXT NOT NULL,
			file_path TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			deleted_at TEXT
		);
	`); err != nil {
		t.Fatalf("create schema: %v", err)
	}

	return db
}

func writeNote(t *testing.T, db *sql.DB, id, workspace, title, body, updatedAt string) string {
	t.Helper()

	path := filepath.Join(t.TempDir(), id+".md")
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatalf("write note: %v", err)
	}
	if _, err := db.Exec(
		`INSERT INTO notes (id, workspace_id, title, file_path, updated_at) VALUES (?, ?, ?, ?, ?)`,
		id, workspace, title, path, updatedAt,
	); err != nil {
		t.Fatalf("insert note: %v", err)
	}

	return path
}

func TestTodayTakesOnlyThisWorkspaceAndThisDay(t *testing.T) {
	// The two promises the settings panel makes, tested together because they
	// are the same query.
	db := openGatherTestDB(t)
	now := time.Date(2026, 8, 25, 14, 0, 0, 0, time.UTC)

	writeNote(t, db, "n1", "workspace-1", "Today here", "today", "2026-08-25T09:00:00Z")
	writeNote(t, db, "n2", "workspace-1", "Yesterday here", "old", "2026-08-24T23:59:00Z")
	writeNote(t, db, "n3", "workspace-2", "Today elsewhere", "other", "2026-08-25T10:00:00Z")

	day, err := NewGatherer(db, nil).Today("workspace-1", now)
	if err != nil {
		t.Fatalf("Today: %v", err)
	}

	if len(day.Notes) != 1 {
		t.Fatalf("Notes = %+v, want only today's note from this workspace", day.Notes)
	}
	if day.Notes[0].Title != "Today here" {
		t.Errorf("Title = %q", day.Notes[0].Title)
	}
}

func TestTodayLeavesOutADeletedNote(t *testing.T) {
	db := openGatherTestDB(t)
	writeNote(t, db, "n1", "workspace-1", "Gone", "text", "2026-08-25T09:00:00Z")
	if _, err := db.Exec(`UPDATE notes SET deleted_at = ? WHERE id = 'n1'`, "2026-08-25T10:00:00Z"); err != nil {
		t.Fatalf("delete note: %v", err)
	}

	day, err := NewGatherer(db, nil).Today("workspace-1", time.Date(2026, 8, 25, 14, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("Today: %v", err)
	}
	if len(day.Notes) != 0 {
		t.Errorf("Notes = %+v, want none", day.Notes)
	}
}

func TestTodaySurvivesANoteWhoseFileIsGone(t *testing.T) {
	// A row without its file is one fewer thing to summarise, not a reason the
	// whole summary fails.
	db := openGatherTestDB(t)
	path := writeNote(t, db, "n1", "workspace-1", "Missing", "text", "2026-08-25T09:00:00Z")
	writeNote(t, db, "n2", "workspace-1", "Present", "text", "2026-08-25T08:00:00Z")
	if err := os.Remove(path); err != nil {
		t.Fatalf("remove file: %v", err)
	}

	day, err := NewGatherer(db, nil).Today("workspace-1", time.Date(2026, 8, 25, 14, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("Today: %v", err)
	}
	if len(day.Notes) != 1 || day.Notes[0].Title != "Present" {
		t.Errorf("Notes = %+v", day.Notes)
	}
}

func TestTodayReadsTheTaskListOnlyWhenItWasTouched(t *testing.T) {
	db := openGatherTestDB(t)
	now := time.Date(2026, 8, 25, 14, 0, 0, 0, time.UTC)

	touched := func(_ string) (string, time.Time, error) {
		return "- [x] Done today", time.Date(2026, 8, 25, 11, 0, 0, 0, time.UTC), nil
	}
	stale := func(_ string) (string, time.Time, error) {
		return "- [ ] From last week", time.Date(2026, 8, 18, 11, 0, 0, 0, time.UTC), nil
	}

	if day, _ := NewGatherer(db, touched).Today("workspace-1", now); !day.TasksTouched {
		t.Error("a task list changed today was left out")
	}
	if day, _ := NewGatherer(db, stale).Today("workspace-1", now); day.TasksTouched {
		t.Error("a task list nobody opened today was included")
	}
}
