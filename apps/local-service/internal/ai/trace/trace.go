// Package trace records what every AI run did.
//
// An AI run is not reproducible: the same input to the same model gives a
// different answer tomorrow, and the model behind a base URL can change
// without notice. So a trace is the only account of a run that will ever
// exist. Anything it does not record about a run is lost the moment the run
// ends — which is why it holds the context verbatim rather than a description
// of it, and why it is written for failures as well as successes.
package trace

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/rinki-s/dao/apps/local-service/internal/ai/llm"
)

type Status string

const (
	// StatusOK: the model answered and the answer validated.
	StatusOK Status = "ok"
	// StatusInvalid: the model answered and the answer did not validate. The
	// run reached the model, so it cost tokens and says something about the
	// prompt.
	StatusInvalid Status = "invalid"
	// StatusFailed: the model never answered — no key, no network, a refusal.
	StatusFailed Status = "failed"
)

type Trace struct {
	ID            string  `json:"id"`
	WorkspaceID   string  `json:"workspaceId"`
	Feature       string  `json:"feature"`
	PromptVersion string  `json:"promptVersion"`
	Wire          string  `json:"wire"`
	Model         string  `json:"model"`
	RequestJSON   string  `json:"requestJson"`
	ResponseText  string  `json:"responseText"`
	OutputJSON    string  `json:"outputJson"`
	Attempts      int     `json:"attempts"`
	InputTokens   int     `json:"inputTokens"`
	OutputTokens  int     `json:"outputTokens"`
	Status        Status  `json:"status"`
	ErrorMessage  string  `json:"errorMessage"`
	ConfirmedAt   *string `json:"confirmedAt"`
	CreatedAt     string  `json:"createdAt"`
}

// Record is a finished run, ready to be written. It is a separate type from
// Trace because a run does not choose its own id or timestamp.
type Record struct {
	WorkspaceID   string
	Feature       string
	PromptVersion string
	Wire          string
	Model         string
	Request       llm.Context
	ResponseText  string
	OutputJSON    string
	Attempts      int
	Usage         llm.Usage
	Status        Status
	ErrorMessage  string
}

type Repository struct {
	db *sql.DB
	// Injected so a test can pin the clock and the ids, and assert on a whole
	// row rather than on the fields that happen to be predictable.
	now    func() time.Time
	nextID func() string
}

func NewRepository(db *sql.DB, nextID func() string) *Repository {
	return &Repository{db: db, now: time.Now, nextID: nextID}
}

func (r *Repository) Record(record Record) (Trace, error) {
	// The context is stored as the JSON it already is. llm.Context carries no
	// behaviour precisely so this can be a verbatim copy.
	request, err := json.Marshal(record.Request)
	if err != nil {
		return Trace{}, fmt.Errorf("encode request: %w", err)
	}

	attempts := record.Attempts
	if attempts < 1 {
		attempts = 1
	}

	stored := Trace{
		ID:            r.nextID(),
		WorkspaceID:   record.WorkspaceID,
		Feature:       record.Feature,
		PromptVersion: record.PromptVersion,
		Wire:          record.Wire,
		Model:         record.Model,
		RequestJSON:   string(request),
		ResponseText:  record.ResponseText,
		OutputJSON:    record.OutputJSON,
		Attempts:      attempts,
		InputTokens:   record.Usage.InputTokens,
		OutputTokens:  record.Usage.OutputTokens,
		Status:        record.Status,
		ErrorMessage:  record.ErrorMessage,
		CreatedAt:     r.now().UTC().Format(time.RFC3339),
	}

	_, err = r.db.Exec(`
		INSERT INTO ai_traces (
			id, workspace_id, feature, prompt_version, wire, model,
			request_json, response_text, output_json, attempts,
			input_tokens, output_tokens, status, error_message, created_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		stored.ID, stored.WorkspaceID, stored.Feature, stored.PromptVersion,
		stored.Wire, stored.Model, stored.RequestJSON, stored.ResponseText,
		stored.OutputJSON, stored.Attempts, stored.InputTokens,
		stored.OutputTokens, string(stored.Status), stored.ErrorMessage,
		stored.CreatedAt,
	)
	if err != nil {
		return Trace{}, err
	}

	return stored, nil
}

const selectColumns = `
	id, workspace_id, feature, prompt_version, wire, model,
	request_json, response_text, output_json, attempts,
	input_tokens, output_tokens, status, error_message, confirmed_at, created_at
`

func scan(row interface{ Scan(...any) error }) (Trace, error) {
	var stored Trace
	var confirmedAt sql.NullString

	err := row.Scan(
		&stored.ID, &stored.WorkspaceID, &stored.Feature, &stored.PromptVersion,
		&stored.Wire, &stored.Model, &stored.RequestJSON, &stored.ResponseText,
		&stored.OutputJSON, &stored.Attempts, &stored.InputTokens,
		&stored.OutputTokens, &stored.Status, &stored.ErrorMessage,
		&confirmedAt, &stored.CreatedAt,
	)
	if err != nil {
		return Trace{}, err
	}

	if confirmedAt.Valid {
		stored.ConfirmedAt = &confirmedAt.String
	}

	return stored, nil
}

func (r *Repository) Get(id string) (Trace, error) {
	return scan(r.db.QueryRow(`SELECT`+selectColumns+`FROM ai_traces WHERE id = ?`, id))
}

// List returns a workspace's runs newest first.
func (r *Repository) List(workspaceID string, limit int) ([]Trace, error) {
	if limit <= 0 {
		limit = 50
	}

	rows, err := r.db.Query(`
		SELECT`+selectColumns+`
		FROM ai_traces
		WHERE workspace_id = ?
		ORDER BY created_at DESC, id DESC
		LIMIT ?
	`, workspaceID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	traces := []Trace{}
	for rows.Next() {
		stored, err := scan(rows)
		if err != nil {
			return nil, err
		}
		traces = append(traces, stored)
	}

	return traces, rows.Err()
}

// Confirm marks that a human accepted what a run proposed.
//
// It is idempotent by refusing rather than by overwriting: the time a change
// was approved is a fact about the past, and a second click should not move
// it. The caller learns nothing was confirmed twice from the false.
func (r *Repository) Confirm(id string) (bool, error) {
	result, err := r.db.Exec(`
		UPDATE ai_traces
		SET confirmed_at = ?
		WHERE id = ? AND confirmed_at IS NULL
	`, r.now().UTC().Format(time.RFC3339), id)
	if err != nil {
		return false, err
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return false, err
	}

	return affected == 1, nil
}
