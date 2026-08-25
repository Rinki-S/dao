package harness

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/rinki-s/dao/apps/local-service/internal/ai/llm"
	"github.com/rinki-s/dao/apps/local-service/internal/ai/llm/llmtest"
)

type writtenNote struct {
	workspaceID string
	title       string
	content     string
}

func recordingWriter(notes *[]writtenNote) NoteWriter {
	return func(workspaceID, title, content string) (string, error) {
		*notes = append(*notes, writtenNote{workspaceID, title, content})
		return "note-1", nil
	}
}

// A fixture that has already produced one successful summary.
func summarised(t *testing.T) (runFixture, string) {
	t.Helper()

	fixture := newRunFixture(t, llmtest.Sequence(llmtest.Turn{Text: goodAnswer}), nil)
	seedTodaysNote(t, fixture.db, "Some work.")

	result, err := fixture.runner.SummarizeToday(context.Background(), "workspace-1")
	if err != nil {
		t.Fatalf("SummarizeToday: %v", err)
	}

	return fixture, result.TraceID
}

func TestSaveSummaryAsNoteWritesWhatWasRecorded(t *testing.T) {
	fixture, traceID := summarised(t)
	var notes []writtenNote

	accepted, err := fixture.runner.SaveSummaryAsNote(traceID, recordingWriter(&notes))
	if err != nil {
		t.Fatalf("SaveSummaryAsNote: %v", err)
	}

	if len(notes) != 1 {
		t.Fatalf("wrote %d notes, want 1", len(notes))
	}
	if notes[0].workspaceID != "workspace-1" {
		t.Errorf("workspaceID = %q", notes[0].workspaceID)
	}
	if !strings.HasPrefix(notes[0].title, "Summary ") {
		t.Errorf("title = %q", notes[0].title)
	}
	// The note is built from the trace, so its text is the summary that was
	// shown — not something a caller reassembled and posted back.
	if !strings.Contains(notes[0].content, "Fixed the parser and started the notes") {
		t.Errorf("content = %q", notes[0].content)
	}
	if accepted.NoteID != "note-1" {
		t.Errorf("NoteID = %q", accepted.NoteID)
	}
}

func TestSavingMarksTheRunConfirmed(t *testing.T) {
	fixture, traceID := summarised(t)
	var notes []writtenNote

	if _, err := fixture.runner.SaveSummaryAsNote(traceID, recordingWriter(&notes)); err != nil {
		t.Fatalf("SaveSummaryAsNote: %v", err)
	}

	stored, err := fixture.traces.Get(traceID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if stored.ConfirmedAt == nil {
		t.Error("the run was saved without being marked confirmed")
	}
}

func TestSavingTwiceWritesOneNote(t *testing.T) {
	// The trace is claimed before the note is written, so a second click finds
	// nothing to claim rather than producing a duplicate.
	fixture, traceID := summarised(t)
	var notes []writtenNote

	if _, err := fixture.runner.SaveSummaryAsNote(traceID, recordingWriter(&notes)); err != nil {
		t.Fatalf("first save: %v", err)
	}

	_, err := fixture.runner.SaveSummaryAsNote(traceID, recordingWriter(&notes))
	if !errors.Is(err, ErrAlreadyAccepted) {
		t.Fatalf("second save error = %v, want ErrAlreadyAccepted", err)
	}
	if len(notes) != 1 {
		t.Errorf("wrote %d notes, want 1", len(notes))
	}
}

func TestSavingARunThatFailed(t *testing.T) {
	// There is nothing to save, and the run must not be marked confirmed for
	// having been asked.
	fixture := newRunFixture(t, llmtest.Sequence(
		llmtest.Turn{Err: &llm.APIError{StatusCode: 401, Body: "no"}},
	), nil)
	seedTodaysNote(t, fixture.db, "Some work.")

	if _, err := fixture.runner.SummarizeToday(context.Background(), "workspace-1"); err == nil {
		t.Fatal("want the run to fail")
	}

	stored := fixture.onlyTrace(t)
	var notes []writtenNote

	_, err := fixture.runner.SaveSummaryAsNote(stored.ID, recordingWriter(&notes))
	if !errors.Is(err, ErrNothingToSave) {
		t.Fatalf("error = %v, want ErrNothingToSave", err)
	}
	if len(notes) != 0 {
		t.Errorf("wrote %d notes for a failed run", len(notes))
	}

	after, err := fixture.traces.Get(stored.ID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if after.ConfirmedAt != nil {
		t.Error("a failed run was marked confirmed")
	}
}

func TestSavingARunThatIsNotThere(t *testing.T) {
	fixture, _ := summarised(t)
	var notes []writtenNote

	if _, err := fixture.runner.SaveSummaryAsNote("trace-missing", recordingWriter(&notes)); !errors.Is(err, ErrTraceNotFound) {
		t.Errorf("error = %v, want ErrTraceNotFound", err)
	}
}

func TestATamperedTraceIsRefused(t *testing.T) {
	// A row can be edited, and a schema can tighten between the run and the
	// save. What comes out of the database is checked on the way out too.
	fixture, traceID := summarised(t)

	if _, err := fixture.db.Exec(
		`UPDATE ai_traces SET output_json = ? WHERE id = ?`,
		`{"headline":"","highlights":[]}`, traceID,
	); err != nil {
		t.Fatalf("tamper: %v", err)
	}

	var notes []writtenNote
	if _, err := fixture.runner.SaveSummaryAsNote(traceID, recordingWriter(&notes)); !errors.Is(err, ErrNothingToSave) {
		t.Errorf("error = %v, want ErrNothingToSave", err)
	}
	if len(notes) != 0 {
		t.Error("an invalid summary reached a note")
	}
}

func TestSummaryDateIsTheLocalDay(t *testing.T) {
	// The trace stores UTC. A run at 23:30 in a +08:00 zone would otherwise be
	// filed under the next day.
	fixture, traceID := summarised(t)

	if _, err := fixture.db.Exec(
		`UPDATE ai_traces SET created_at = ? WHERE id = ?`,
		"2026-08-25T15:30:00Z", traceID,
	); err != nil {
		t.Fatalf("update: %v", err)
	}

	var notes []writtenNote
	if _, err := fixture.runner.SaveSummaryAsNote(traceID, recordingWriter(&notes)); err != nil {
		t.Fatalf("SaveSummaryAsNote: %v", err)
	}

	stored, err := fixture.traces.Get(traceID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	// Whatever zone the test runs in, the title is that zone's day.
	wantDate := summaryDate(stored.CreatedAt, runNow)
	if !strings.Contains(notes[0].title, wantDate) {
		t.Errorf("title = %q, want the local day %q", notes[0].title, wantDate)
	}
	if !strings.Contains(notes[0].content, wantDate) {
		t.Errorf("content heading is not the local day: %q", notes[0].content)
	}
}

func TestAFailedNoteWriteDoesNotLoseTheRun(t *testing.T) {
	fixture, traceID := summarised(t)

	failing := func(string, string, string) (string, error) {
		return "", errors.New("disk full")
	}

	if _, err := fixture.runner.SaveSummaryAsNote(traceID, failing); err == nil {
		t.Fatal("want the write error")
	}

	// The trace is claimed first, so a failed write leaves it confirmed with
	// no note. Recorded here as the known consequence of claiming first: a
	// duplicate note is worse than a retry the user has to make by hand.
	stored, err := fixture.traces.Get(traceID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if stored.ConfirmedAt == nil {
		t.Error("the trace was not claimed before the write")
	}
	if stored.OutputJSON == "" {
		t.Error("the summary itself was lost")
	}
}
