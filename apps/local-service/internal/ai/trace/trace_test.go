package trace

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"path/filepath"
	"testing"
	"time"

	"github.com/rinki-s/dao/apps/local-service/internal/ai/llm"

	_ "modernc.org/sqlite"
)

func openTestRepository(t *testing.T) *Repository {
	t.Helper()

	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "trace-test.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { db.Close() })

	if _, err := db.Exec(`
		CREATE TABLE ai_traces (
			id TEXT PRIMARY KEY,
			workspace_id TEXT NOT NULL,
			feature TEXT NOT NULL,
			prompt_version TEXT NOT NULL,
			wire TEXT NOT NULL,
			model TEXT NOT NULL,
			request_json TEXT NOT NULL,
			response_text TEXT NOT NULL DEFAULT '',
			output_json TEXT NOT NULL DEFAULT '',
			attempts INTEGER NOT NULL DEFAULT 1,
			input_tokens INTEGER NOT NULL DEFAULT 0,
			output_tokens INTEGER NOT NULL DEFAULT 0,
			status TEXT NOT NULL,
			error_message TEXT NOT NULL DEFAULT '',
			confirmed_at TEXT,
			created_at TEXT NOT NULL
		);
	`); err != nil {
		t.Fatalf("create schema: %v", err)
	}

	// A pinned clock and counted ids, so a test can assert on a whole row.
	counter := 0
	repo := NewRepository(db, func() string {
		counter++
		return fmt.Sprintf("trace-%d", counter)
	})
	moment := time.Date(2026, 8, 25, 9, 30, 0, 0, time.UTC)
	repo.now = func() time.Time {
		moment = moment.Add(time.Second)
		return moment
	}

	return repo
}

func exampleRequest() llm.Context {
	return llm.Context{
		SystemPrompt: "Summarise the day.",
		Messages:     []llm.Message{llm.UserText("3 notes, 2 tasks")},
	}
}

func okRecord() Record {
	return Record{
		WorkspaceID:   "workspace-1",
		Feature:       "summarize-today",
		PromptVersion: "1",
		Wire:          "anthropic",
		Model:         "some-model",
		Request:       exampleRequest(),
		ResponseText:  `{"headline":"A quiet day"}`,
		OutputJSON:    `{"headline":"A quiet day"}`,
		Usage:         llm.Usage{InputTokens: 120, OutputTokens: 40},
		Status:        StatusOK,
	}
}

func TestRecordKeepsTheContextVerbatim(t *testing.T) {
	repo := openTestRepository(t)

	stored, err := repo.Record(okRecord())
	if err != nil {
		t.Fatalf("Record: %v", err)
	}

	// The point of storing the context rather than describing it: it decodes
	// back into the exact value the model was given.
	var decoded llm.Context
	if err := json.Unmarshal([]byte(stored.RequestJSON), &decoded); err != nil {
		t.Fatalf("stored request is not decodable: %v", err)
	}
	if decoded.SystemPrompt != exampleRequest().SystemPrompt {
		t.Errorf("SystemPrompt = %q", decoded.SystemPrompt)
	}
	if len(decoded.Messages) != 1 || decoded.Messages[0].Content[0].Text != "3 notes, 2 tasks" {
		t.Errorf("Messages = %+v", decoded.Messages)
	}
}

func TestRecordRoundTrips(t *testing.T) {
	repo := openTestRepository(t)

	stored, err := repo.Record(okRecord())
	if err != nil {
		t.Fatalf("Record: %v", err)
	}

	read, err := repo.Get(stored.ID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if read != stored {
		t.Errorf("Get = %+v, want %+v", read, stored)
	}
	if read.ConfirmedAt != nil {
		t.Error("a fresh trace is already confirmed")
	}
}

func TestAFailedRunIsStillRecorded(t *testing.T) {
	// The runs worth reading about are the ones that went wrong, so a trace
	// that only exists on success is worth very little.
	repo := openTestRepository(t)

	record := okRecord()
	record.ResponseText = ""
	record.OutputJSON = ""
	record.Status = StatusFailed
	record.ErrorMessage = "provider returned 401"
	record.Usage = llm.Usage{}

	stored, err := repo.Record(record)
	if err != nil {
		t.Fatalf("Record: %v", err)
	}
	if stored.Status != StatusFailed || stored.ErrorMessage != "provider returned 401" {
		t.Errorf("stored = %+v", stored)
	}
}

func TestAnInvalidAnswerKeepsBothSides(t *testing.T) {
	// The interesting failure is the one where what the model wrote and what
	// parsed out of it disagree, so both are kept.
	repo := openTestRepository(t)

	record := okRecord()
	record.ResponseText = "Sure! Here is your summary:\n{\"headline\":"
	record.OutputJSON = ""
	record.Attempts = 2
	record.Status = StatusInvalid
	record.ErrorMessage = "unexpected end of JSON input"

	stored, err := repo.Record(record)
	if err != nil {
		t.Fatalf("Record: %v", err)
	}

	if stored.ResponseText == "" {
		t.Error("the model's own words were dropped")
	}
	if stored.OutputJSON != "" {
		t.Error("an unparseable answer produced parsed output")
	}
	// Two attempts is a fact about the prompt, not about this run alone.
	if stored.Attempts != 2 {
		t.Errorf("Attempts = %d, want 2", stored.Attempts)
	}
}

func TestAttemptsIsAtLeastOne(t *testing.T) {
	// A run that reached the model asked it at least once, whatever the caller
	// filled in.
	repo := openTestRepository(t)

	record := okRecord()
	record.Attempts = 0

	stored, err := repo.Record(record)
	if err != nil {
		t.Fatalf("Record: %v", err)
	}
	if stored.Attempts != 1 {
		t.Errorf("Attempts = %d, want 1", stored.Attempts)
	}
}

func TestListIsNewestFirstAndPerWorkspace(t *testing.T) {
	repo := openTestRepository(t)

	for _, workspace := range []string{"workspace-1", "workspace-2", "workspace-1"} {
		record := okRecord()
		record.WorkspaceID = workspace
		if _, err := repo.Record(record); err != nil {
			t.Fatalf("Record: %v", err)
		}
	}

	traces, err := repo.List("workspace-1", 0)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(traces) != 2 {
		t.Fatalf("len(traces) = %d, want the two from workspace-1", len(traces))
	}
	if traces[0].ID != "trace-3" {
		t.Errorf("first = %q, want the newest", traces[0].ID)
	}
}

func TestListOfNothingIsEmptyNotNil(t *testing.T) {
	// It is encoded straight to JSON, and `null` is not a list.
	traces, err := openTestRepository(t).List("workspace-nothing", 0)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if traces == nil {
		t.Error("List returned nil")
	}
	if len(traces) != 0 {
		t.Errorf("len(traces) = %d", len(traces))
	}
}

func TestConfirmHappensOnce(t *testing.T) {
	repo := openTestRepository(t)

	stored, err := repo.Record(okRecord())
	if err != nil {
		t.Fatalf("Record: %v", err)
	}

	confirmed, err := repo.Confirm(stored.ID)
	if err != nil {
		t.Fatalf("Confirm: %v", err)
	}
	if !confirmed {
		t.Fatal("Confirm reported nothing was confirmed")
	}

	read, err := repo.Get(stored.ID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if read.ConfirmedAt == nil {
		t.Fatal("ConfirmedAt is still nil")
	}
	firstTime := *read.ConfirmedAt

	// A second click must not move the time a change was approved: that is a
	// fact about the past.
	again, err := repo.Confirm(stored.ID)
	if err != nil {
		t.Fatalf("Confirm again: %v", err)
	}
	if again {
		t.Error("Confirm reported a second confirmation")
	}

	read, err = repo.Get(stored.ID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if *read.ConfirmedAt != firstTime {
		t.Errorf("ConfirmedAt moved from %q to %q", firstTime, *read.ConfirmedAt)
	}
}

func TestConfirmingSomethingThatIsNotThere(t *testing.T) {
	confirmed, err := openTestRepository(t).Confirm("trace-missing")
	if err != nil {
		t.Fatalf("Confirm: %v", err)
	}
	if confirmed {
		t.Error("confirmed a trace that does not exist")
	}
}
