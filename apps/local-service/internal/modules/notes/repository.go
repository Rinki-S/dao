package notes

import (
	"database/sql"
	"time"

	"github.com/oklog/ulid/v2"
	"github.com/rinki-s/dao/apps/local-service/internal/modules/search"
)

type Repository struct {
	db      *sql.DB
	indexer search.Indexer
}

func NewRepository(db *sql.DB, indexer search.Indexer) *Repository {
	return &Repository{db: db, indexer: indexer}
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

	tx, err := r.db.Begin()
	if err != nil {
		return Note{}, err
	}
	defer tx.Rollback()

	_, err = tx.Exec(`
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

	if err := r.indexer.IndexTx(tx, search.IndexEntry{
		EntityType:  "note",
		EntityID:    note.ID,
		WorkspaceID: note.WorkspaceID,
		ProjectID:   note.ProjectID,
		Title:       note.Title,
		Body:        note.Content,
		CreatedAt:   note.CreatedAt,
		UpdatedAt:   note.UpdatedAt,
	}); err != nil {
		return Note{}, err
	}

	if err := tx.Commit(); err != nil {
		return Note{}, err
	}

	return note, nil
}
