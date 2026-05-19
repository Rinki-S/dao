package notes

import (
	"database/sql"
	"time"

	"github.com/oklog/ulid/v2"
)

type Repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) List() ([]Note, error) {
	rows, err := r.db.Query(`
		SELECT
			id, workspace_id, project_id, title, content, content_type, note_type,
			created_at, updated_at, deleted_at, version, sync_status
		FROM notes
		WHERE deleted_at IS NULL
		ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	notes := []Note{}

	for rows.Next() {
		var note Note

		if err := rows.Scan(
			&note.ID,
			&note.WorkspaceID,
			&note.ProjectID,
			&note.Title,
			&note.Content,
			&note.ContentType,
			&note.NoteType,
			&note.CreatedAt,
			&note.UpdatedAt,
			&note.DeletedAt,
			&note.Version,
			&note.SyncStatus,
		); err != nil {
			return nil, err
		}

		notes = append(notes, note)
	}

	return notes, rows.Err()
}

func (r *Repository) Create(req CreateNoteRequest) (Note, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	contentType := req.ContentType
	if contentType == "" {
		contentType = "markdown"
	}

	noteType := req.NoteType
	if noteType == "" {
		noteType = "general"
	}

	note := Note{
		ID:          ulid.Make().String(),
		WorkspaceID: req.WorkspaceID,
		ProjectID:   req.ProjectID,
		Title:       req.Title,
		Content:     req.Content,
		ContentType: contentType,
		NoteType:    noteType,
		CreatedAt:   now,
		UpdatedAt:   now,
		DeletedAt:   nil,
		Version:     1,
		SyncStatus:  "local",
	}

	_, err := r.db.Exec(`
		INSERT INTO notes (
			id, workspace_id, project_id, title, content, content_type, note_type,
			created_at, updated_at, deleted_at, version, sync_status
		)
		VALUES (
			?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
		)
	`,
		note.ID,
		note.WorkspaceID,
		note.ProjectID,
		note.Title,
		note.Content,
		note.ContentType,
		note.NoteType,
		note.CreatedAt,
		note.UpdatedAt,
		note.DeletedAt,
		note.Version,
		note.SyncStatus,
	)
	if err != nil {
		return Note{}, err
	}

	return note, nil
}
