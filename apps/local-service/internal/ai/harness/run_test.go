package harness

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/rinki-s/dao/apps/local-service/internal/ai/llm"
	"github.com/rinki-s/dao/apps/local-service/internal/ai/llm/llmtest"
	"github.com/rinki-s/dao/apps/local-service/internal/ai/trace"

	_ "modernc.org/sqlite"
)

var runNow = time.Date(2026, 8, 25, 14, 0, 0, 0, time.UTC)

func openRunTestDB(t *testing.T) *sql.DB {
	t.Helper()

	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "run-test.db"))
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

	return db
}

func seedTodaysNote(t *testing.T, db *sql.DB, body string) {
	t.Helper()

	path := filepath.Join(t.TempDir(), "note.md")
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatalf("write note: %v", err)
	}
	if _, err := db.Exec(
		`INSERT INTO notes (id, workspace_id, title, file_path, updated_at) VALUES (?, ?, ?, ?, ?)`,
		"note-1", "workspace-1", "Parser work", path, "2026-08-25T09:00:00Z",
	); err != nil {
		t.Fatalf("insert note: %v", err)
	}
}

type runFixture struct {
	runner *Runner
	traces *trace.Repository
	fake   *llmtest.Fake
	db     *sql.DB
}

func newRunFixture(t *testing.T, fake *llmtest.Fake, clientErr error) runFixture {
	t.Helper()

	db := openRunTestDB(t)
	counter := 0
	traces := trace.NewRepository(db, func() string {
		counter++
		return fmt.Sprintf("trace-%d", counter)
	})

	return runFixture{
		db:     db,
		fake:   fake,
		traces: traces,
		runner: &Runner{
			Gather: NewGatherer(db, nil),
			Traces: traces,
			NewClient: func() (llm.Client, error) {
				if clientErr != nil {
					return nil, clientErr
				}
				return fake, nil
			},
			Describe: func() (string, string) { return "anthropic", "some-model" },
			Now:      func() time.Time { return runNow },
		},
	}
}

func (f runFixture) onlyTrace(t *testing.T) trace.Trace {
	t.Helper()

	traces, err := f.traces.List("workspace-1", 0)
	if err != nil {
		t.Fatalf("List traces: %v", err)
	}
	if len(traces) != 1 {
		t.Fatalf("len(traces) = %d, want exactly one", len(traces))
	}

	return traces[0]
}

func TestSummarizeTodayHappyPath(t *testing.T) {
	fixture := newRunFixture(t, llmtest.Sequence(llmtest.Turn{
		Text:  goodAnswer,
		Usage: llm.Usage{InputTokens: 400, OutputTokens: 60},
	}), nil)
	seedTodaysNote(t, fixture.db, "Rewrote the parser recovery path.")

	result, err := fixture.runner.SummarizeToday(context.Background(), "workspace-1")
	if err != nil {
		t.Fatalf("SummarizeToday: %v", err)
	}

	if result.Summary.Headline == "" {
		t.Error("no headline came back")
	}
	if result.Date != "2026-08-25" {
		t.Errorf("Date = %q", result.Date)
	}
	if result.Included.Notes != 1 {
		t.Errorf("Included = %+v, want one note", result.Included)
	}

	// The note's text reached the model — this is the feature working, and
	// also the promise the settings panel makes.
	sent := fixture.fake.Requests[0]
	if !strings.Contains(sent.Messages[0].Content[0].Text, "Rewrote the parser recovery path") {
		t.Errorf("the note did not reach the model:\n%s", sent.Messages[0].Content[0].Text)
	}

	stored := fixture.onlyTrace(t)
	if stored.Status != trace.StatusOK {
		t.Errorf("Status = %q", stored.Status)
	}
	if stored.ID != result.TraceID {
		t.Errorf("TraceID = %q, trace = %q", result.TraceID, stored.ID)
	}
	if stored.InputTokens != 400 || stored.OutputTokens != 60 {
		t.Errorf("usage = %d/%d", stored.InputTokens, stored.OutputTokens)
	}
	if stored.PromptVersion != SummaryPromptVersion {
		t.Errorf("PromptVersion = %q", stored.PromptVersion)
	}
}

func TestAnEmptyDayNeverReachesTheModel(t *testing.T) {
	// Nothing to summarise costs nothing to say. Calling the model to be told
	// the day was empty spends the user's money on a fact already known.
	fixture := newRunFixture(t, llmtest.Text(goodAnswer), nil)

	_, err := fixture.runner.SummarizeToday(context.Background(), "workspace-1")
	if !errors.Is(err, ErrNothingToday) {
		t.Fatalf("error = %v, want ErrNothingToday", err)
	}
	if fixture.fake.Calls() != 0 {
		t.Errorf("the model was called %d times for an empty day", fixture.fake.Calls())
	}

	traces, err := fixture.traces.List("workspace-1", 0)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(traces) != 0 {
		t.Errorf("an empty day wrote %d traces", len(traces))
	}
}

func TestABadAnswerIsRetriedWithTheComplaint(t *testing.T) {
	fixture := newRunFixture(t, llmtest.Sequence(
		llmtest.Turn{Text: "Looks like a productive day!", Usage: llm.Usage{InputTokens: 400, OutputTokens: 10}},
		llmtest.Turn{Text: goodAnswer, Usage: llm.Usage{InputTokens: 500, OutputTokens: 60}},
	), nil)
	seedTodaysNote(t, fixture.db, "Some work.")

	result, err := fixture.runner.SummarizeToday(context.Background(), "workspace-1")
	if err != nil {
		t.Fatalf("SummarizeToday: %v", err)
	}
	if result.Summary.Headline == "" {
		t.Error("the retry did not produce a summary")
	}

	if fixture.fake.Calls() != 2 {
		t.Fatalf("the model was called %d times, want 2", fixture.fake.Calls())
	}

	// A retry that only repeats the question invites the same answer. The
	// second request carries the failed reply and what was wrong with it.
	second := fixture.fake.Requests[1]
	if len(second.Messages) != 3 {
		t.Fatalf("second request had %d messages, want the original plus the correction", len(second.Messages))
	}
	if second.Messages[1].Role != llm.RoleAssistant {
		t.Error("the model's own failed answer was not fed back")
	}
	if !strings.Contains(second.Messages[1].Content[0].Text, "productive day") {
		t.Error("the failed answer was not the one fed back")
	}
	if !strings.Contains(second.Messages[2].Content[0].Text, "only the JSON object") {
		t.Errorf("no correction was given:\n%s", second.Messages[2].Content[0].Text)
	}

	stored := fixture.onlyTrace(t)
	if stored.Attempts != 2 {
		t.Errorf("Attempts = %d, want 2", stored.Attempts)
	}
	// A retry is spent money too, so both attempts are counted.
	if stored.InputTokens != 900 || stored.OutputTokens != 70 {
		t.Errorf("usage = %d/%d, want both attempts", stored.InputTokens, stored.OutputTokens)
	}
	// The trace shows what the model was actually answering the second time.
	if !strings.Contains(stored.RequestJSON, "only the JSON object") {
		t.Error("the recorded request is the first one, not the one that was sent")
	}
}

func TestTwoBadAnswersGiveUp(t *testing.T) {
	// A model that answers unusably twice is telling you about the prompt. A
	// third attempt spends money to learn nothing.
	fixture := newRunFixture(t, llmtest.Sequence(
		llmtest.Turn{Text: "Nope."},
		llmtest.Turn{Text: "Still nope."},
	), nil)
	seedTodaysNote(t, fixture.db, "Some work.")

	if _, err := fixture.runner.SummarizeToday(context.Background(), "workspace-1"); err == nil {
		t.Fatal("want an error after two unusable answers")
	}
	if fixture.fake.Calls() != 2 {
		t.Errorf("the model was called %d times, want 2", fixture.fake.Calls())
	}

	stored := fixture.onlyTrace(t)
	if stored.Status != trace.StatusInvalid {
		t.Errorf("Status = %q, want invalid — it answered, the answer was unusable", stored.Status)
	}
	// The model's own words are kept, which is the only way to see why.
	if stored.ResponseText != "Still nope." {
		t.Errorf("ResponseText = %q", stored.ResponseText)
	}
}

func TestAProviderRefusalIsNotRetried(t *testing.T) {
	// A 401 will be a 401 again. Retrying spends a second call to hit the
	// same wall, and this is not the model's answer being wrong.
	refusal := &llm.APIError{StatusCode: 401, Body: "invalid key"}
	fixture := newRunFixture(t, llmtest.Sequence(
		llmtest.Turn{Err: refusal, Usage: llm.Usage{InputTokens: 400}},
		llmtest.Turn{Text: goodAnswer},
	), nil)
	seedTodaysNote(t, fixture.db, "Some work.")

	_, err := fixture.runner.SummarizeToday(context.Background(), "workspace-1")
	if err == nil {
		t.Fatal("want the provider's refusal")
	}
	if fixture.fake.Calls() != 1 {
		t.Errorf("the model was called %d times, want 1", fixture.fake.Calls())
	}

	stored := fixture.onlyTrace(t)
	if stored.Status != trace.StatusFailed {
		t.Errorf("Status = %q, want failed — it never answered", stored.Status)
	}
	// The tokens a half-finished call spent are still recorded.
	if stored.InputTokens != 400 {
		t.Errorf("InputTokens = %d, want the tokens the failed call spent", stored.InputTokens)
	}
}

func TestNoProviderIsStillARun(t *testing.T) {
	fixture := newRunFixture(t, llmtest.Text(goodAnswer), llm.ErrNotConfigured)
	seedTodaysNote(t, fixture.db, "Some work.")

	_, err := fixture.runner.SummarizeToday(context.Background(), "workspace-1")
	if !errors.Is(err, llm.ErrNotConfigured) {
		t.Fatalf("error = %v, want ErrNotConfigured", err)
	}

	stored := fixture.onlyTrace(t)
	if stored.Status != trace.StatusFailed {
		t.Errorf("Status = %q", stored.Status)
	}
	if stored.InputTokens != 0 {
		t.Error("a run that never reached a provider recorded tokens")
	}
}

func TestATruncatedAnswerSaysSo(t *testing.T) {
	// "Invalid JSON" would point at the prompt. The ceiling is ours.
	fixture := newRunFixture(t, llmtest.Sequence(
		llmtest.Turn{Text: `{"headline":"Fixed the par`, Stop: llm.StopLength},
		llmtest.Turn{Text: `{"headline":"Fixed the par`, Stop: llm.StopLength},
	), nil)
	seedTodaysNote(t, fixture.db, "Some work.")

	_, err := fixture.runner.SummarizeToday(context.Background(), "workspace-1")
	if err == nil || !strings.Contains(err.Error(), "cut short") {
		t.Fatalf("error = %v, want it to say the answer was cut short", err)
	}
}
