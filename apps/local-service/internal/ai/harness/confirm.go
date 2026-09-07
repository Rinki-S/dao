package harness

import (
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/rinki-s/dao/apps/local-service/internal/ai/trace"
)

var (
	ErrTraceNotFound   = errors.New("no such run")
	ErrNothingToSave   = errors.New("that run produced nothing to save")
	ErrAlreadyAccepted = errors.New("that run was already saved")
)

// NoteWriter creates a note. A function rather than the notes repository, for
// the same reason TasksReader is: the harness stays below the modules.
type NoteWriter func(workspaceID, title, content string) (noteID string, err error)

// Accepted is what a confirmation produced.
type Accepted struct {
	TraceID string `json:"traceId"`
	NoteID  string `json:"noteId"`
	Title   string `json:"title"`
}

// SaveSummaryAsNote turns a recorded run into a note.
//
// The note is built from the trace, not from anything the caller sends. That
// is the point of routing it through here: what gets saved is provably the
// summary that was shown and recorded, rather than something a renderer
// reassembled and posted back. A confirmation that trusts its own payload
// confirms nothing.
func (r *Runner) SaveSummaryAsNote(traceID string, writeNote NoteWriter) (Accepted, error) {
	stored, err := r.Traces.Get(traceID)
	if err != nil {
		return Accepted{}, ErrTraceNotFound
	}

	if stored.Status != trace.StatusOK || stored.OutputJSON == "" {
		return Accepted{}, ErrNothingToSave
	}
	if stored.ConfirmedAt != nil {
		return Accepted{}, ErrAlreadyAccepted
	}

	var summary DaySummary
	if err := json.Unmarshal([]byte(stored.OutputJSON), &summary); err != nil {
		return Accepted{}, ErrNothingToSave
	}
	// Checked again on the way out. A row can be edited, and a schema can
	// tighten between the run and the save.
	if err := summary.Validate(); err != nil {
		return Accepted{}, ErrNothingToSave
	}

	date := summaryDate(stored.CreatedAt, r.Now())
	title := fmt.Sprintf("Summary %s", date)

	// Claim the trace before writing anything. Two clicks that both check
	// first and write after would each see an unconfirmed run and produce a
	// note; claiming first means the second finds nothing to claim.
	claimed, err := r.Traces.Confirm(traceID)
	if err != nil {
		return Accepted{}, err
	}
	if !claimed {
		return Accepted{}, ErrAlreadyAccepted
	}

	noteID, err := writeNote(stored.WorkspaceID, title, summary.Markdown(date))
	if err != nil {
		return Accepted{}, err
	}

	return Accepted{TraceID: traceID, NoteID: noteID, Title: title}, nil
}

// summaryDate is the local day the run happened on, which is the day it
// summarised. The trace stores UTC, and a run at 23:30 in a +08:00 zone would
// otherwise be filed under the next day.
func summaryDate(createdAt string, fallback time.Time) string {
	parsed, err := time.Parse(time.RFC3339, createdAt)
	if err != nil {
		return fallback.Format("2006-01-02")
	}

	return parsed.Local().Format("2006-01-02")
}
