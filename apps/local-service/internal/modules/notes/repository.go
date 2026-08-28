package notes

import (
	"database/sql"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"time"

	"github.com/oklog/ulid/v2"
	"github.com/rinki-s/dao/apps/local-service/internal/files"
	"github.com/rinki-s/dao/apps/local-service/internal/modules/activities"
	"github.com/rinki-s/dao/apps/local-service/internal/modules/search"
)

// ErrProjectNotFound distinguishes an unknown destination folder from an
// unknown note, which both surface as sql.ErrNoRows otherwise.
var ErrProjectNotFound = errors.New("project not found")

type Repository struct {
	db       *sql.DB
	indexer  search.Indexer
	activity *activities.Repository
}

func NewRepository(db *sql.DB, indexer search.Indexer, activity *activities.Repository) *Repository {
	return &Repository{db: db, indexer: indexer, activity: activity}
}

const noteSelectColumns = `
	id, workspace_id, project_id, title, file_path, content_type, note_type,
	created_at, updated_at, deleted_at, version, sync_status
`

func (r *Repository) List() ([]Note, error) {
	rows, err := r.db.Query(`
		SELECT
			` + noteSelectColumns + `
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
		note, err := scanNote(rows)
		if err != nil {
			return nil, err
		}

		notes = append(notes, note)
	}

	return notes, rows.Err()
}

func (r *Repository) Get(id string) (Note, error) {
	note, err := scanNote(r.db.QueryRow(`
		SELECT
			`+noteSelectColumns+`
		FROM notes
		WHERE id = ? AND deleted_at IS NULL
	`, id))
	if err != nil {
		return Note{}, err
	}

	content, err := os.ReadFile(note.FilePath)
	if err != nil {
		return Note{}, err
	}

	note.Content = string(content)

	return note, nil
}

func (r *Repository) Create(req CreateNoteRequest) (Note, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	id := ulid.Make().String()
	contentType := req.ContentType
	if contentType == "" {
		contentType = "markdown"
	}

	noteType := req.NoteType
	if noteType == "" {
		noteType = "general"
	}

	parentDir, err := r.noteParentDir(req.WorkspaceID, req.ProjectID)
	if err != nil {
		return Note{}, err
	}

	filePath := files.MarkdownNoteFilePath(parentDir, req.Title, "")

	if err := os.WriteFile(filePath, []byte(req.Content), 0644); err != nil {
		return Note{}, err
	}

	committed := false
	defer func() {
		if !committed {
			_ = os.Remove(filePath)
		}
	}()

	note := Note{
		ID:          id,
		WorkspaceID: req.WorkspaceID,
		ProjectID:   req.ProjectID,
		Title:       req.Title,
		Content:     "",
		FilePath:    filePath,
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
			id, workspace_id, project_id, title, file_path, content_type, note_type,
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
		note.FilePath,
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
		Body:        req.Content,
		CreatedAt:   note.CreatedAt,
		UpdatedAt:   note.UpdatedAt,
	}); err != nil {
		return Note{}, err
	}

	metadata, err := json.Marshal(map[string]string{
		"title":    note.Title,
		"noteType": note.NoteType,
	})
	if err != nil {
		return Note{}, err
	}

	if _, err := r.activity.CreateTx(tx, activities.CreateActivityRequest{
		WorkspaceID:  note.WorkspaceID,
		ProjectID:    note.ProjectID,
		EntityType:   "note",
		EntityID:     note.ID,
		Action:       "created",
		MetadataJSON: string(metadata),
	}); err != nil {
		return Note{}, err
	}

	if err := tx.Commit(); err != nil {
		return Note{}, err
	}

	committed = true

	return note, nil
}

// UpdateContent writes a note's file, unless somebody else already did.
//
// expectedUpdatedAt is what the caller believed the note said when it read it.
// Empty skips the check, which is how a caller says "I have seen the conflict
// and I mean it".
//
// Two ways the file can have moved on, and both have to be caught:
//
// The row's updated_at no longer matches what the caller expected — an external
// edit the watcher has already reconciled, which is the ordinary case.
//
// The file itself is newer than the row — an external edit the watcher has not
// caught up with yet. Without this second check there is a window, a fraction
// of a second wide, in which a save silently wins over an edit it never saw.
func (r *Repository) UpdateContent(id string, content string, expectedUpdatedAt string) (Note, error) {
	now := time.Now().UTC().Format(time.RFC3339)

	note, err := scanNote(r.db.QueryRow(`
		SELECT
			`+noteSelectColumns+`
		FROM notes
		WHERE id = ? AND deleted_at IS NULL
	`, id))
	if err != nil {
		return Note{}, err
	}

	previousContent, err := os.ReadFile(note.FilePath)
	if err != nil {
		return Note{}, err
	}

	if expectedUpdatedAt != "" {
		if conflict := r.conflict(note, expectedUpdatedAt, previousContent); conflict != nil {
			return Note{}, conflict
		}
	}

	if err := os.WriteFile(note.FilePath, []byte(content), 0644); err != nil {
		return Note{}, err
	}

	committed := false
	defer func() {
		if !committed {
			_ = os.WriteFile(note.FilePath, previousContent, 0644)
		}
	}()

	tx, err := r.db.Begin()
	if err != nil {
		return Note{}, err
	}
	defer tx.Rollback()

	result, err := tx.Exec(`
		UPDATE notes
		SET updated_at = ?, version = version + 1, sync_status = 'local'
		WHERE id = ? AND deleted_at IS NULL
	`, now, id)
	if err != nil {
		return Note{}, err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return Note{}, err
	}
	if rowsAffected == 0 {
		return Note{}, sql.ErrNoRows
	}

	note.UpdatedAt = now
	note.Version += 1
	note.SyncStatus = "local"

	if err := r.indexer.ReplaceTx(tx, search.IndexEntry{
		EntityType:  "note",
		EntityID:    note.ID,
		WorkspaceID: note.WorkspaceID,
		ProjectID:   note.ProjectID,
		Title:       note.Title,
		Body:        content,
		CreatedAt:   note.CreatedAt,
		UpdatedAt:   note.UpdatedAt,
	}); err != nil {
		return Note{}, err
	}

	if err := tx.Commit(); err != nil {
		return Note{}, err
	}

	committed = true
	note.Content = content

	return note, nil
}

func (r *Repository) Update(id string, req UpdateNoteRequest) (Note, error) {
	now := time.Now().UTC().Format(time.RFC3339)

	note, err := scanNote(r.db.QueryRow(`
		SELECT
			`+noteSelectColumns+`
		FROM notes
		WHERE id = ? AND deleted_at IS NULL
	`, id))
	if err != nil {
		return Note{}, err
	}

	if req.Title != nil {
		note.Title = *req.Title
	}
	if req.NoteType != nil {
		note.NoteType = *req.NoteType
	}

	// The title is the file name and the folder is the directory, so renaming
	// and moving are the same operation: recompute the path. The file this note
	// already occupies is passed along, because a note keeping its title must
	// keep its name rather than being numbered out of the way of itself.
	previousPath := note.FilePath
	parentDir := filepath.Dir(previousPath)

	if req.ProjectID.Set {
		note.ProjectID = req.ProjectID.Value

		parentDir, err = r.noteParentDir(note.WorkspaceID, note.ProjectID)
		if err != nil {
			return Note{}, err
		}
	}

	nextPath := files.MarkdownNoteFilePath(parentDir, note.Title, previousPath)
	moved := nextPath != previousPath

	if moved {
		if err := os.Rename(previousPath, nextPath); err != nil {
			return Note{}, err
		}

		note.FilePath = nextPath
	}

	committed := false
	defer func() {
		if moved && !committed {
			_ = os.Rename(nextPath, previousPath)
		}
	}()

	content, err := os.ReadFile(note.FilePath)
	if err != nil {
		return Note{}, err
	}

	tx, err := r.db.Begin()
	if err != nil {
		return Note{}, err
	}
	defer tx.Rollback()

	result, err := tx.Exec(`
		UPDATE notes
		SET title = ?, note_type = ?, project_id = ?, file_path = ?, updated_at = ?, version = version + 1, sync_status = 'local'
		WHERE id = ? AND deleted_at IS NULL
	`, note.Title, note.NoteType, note.ProjectID, note.FilePath, now, id)
	if err != nil {
		return Note{}, err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return Note{}, err
	}
	if rowsAffected == 0 {
		return Note{}, sql.ErrNoRows
	}

	note.UpdatedAt = now
	note.Version += 1
	note.SyncStatus = "local"
	note.Content = string(content)

	if err := r.indexer.ReplaceTx(tx, search.IndexEntry{
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

	committed = true

	return note, nil
}

func (r *Repository) Delete(id string) error {
	now := time.Now().UTC().Format(time.RFC3339)

	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	result, err := tx.Exec(`
		UPDATE notes
		SET deleted_at = ?, updated_at = ?, version = version + 1, sync_status = 'local'
		WHERE id = ? AND deleted_at IS NULL
	`, now, now, id)
	if err != nil {
		return err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return sql.ErrNoRows
	}

	if err := r.indexer.DeleteTx(tx, "note", id); err != nil {
		return err
	}

	return tx.Commit()
}

func (r *Repository) noteParentDir(workspaceID string, projectID *string) (string, error) {
	if projectID != nil {
		var folderPath string
		if err := r.db.QueryRow(`
			SELECT folder_path
			FROM projects
			WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL
		`, *projectID, workspaceID).Scan(&folderPath); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return "", ErrProjectNotFound
			}

			return "", err
		}

		return folderPath, nil
	}

	var rootPath string
	if err := r.db.QueryRow(`
		SELECT root_path
		FROM workspaces
		WHERE id = ? AND deleted_at IS NULL
	`, workspaceID).Scan(&rootPath); err != nil {
		return "", err
	}

	return rootPath, nil
}

type noteScanner interface {
	Scan(dest ...any) error
}

func scanNote(scanner noteScanner) (Note, error) {
	var note Note

	if err := scanner.Scan(
		&note.ID,
		&note.WorkspaceID,
		&note.ProjectID,
		&note.Title,
		&note.FilePath,
		&note.ContentType,
		&note.NoteType,
		&note.CreatedAt,
		&note.UpdatedAt,
		&note.DeletedAt,
		&note.Version,
		&note.SyncStatus,
	); err != nil {
		return Note{}, err
	}

	return note, nil
}

// conflict reports whether the file moved on since the caller read it.
func (r *Repository) conflict(note Note, expectedUpdatedAt string, onDisk []byte) error {
	moved := note.UpdatedAt != expectedUpdatedAt

	if !moved {
		// The watcher may not have caught up. Compared against the row rather
		// than against what the caller expects, because those are the same
		// string here and the file is the thing that might be ahead of both.
		if info, err := os.Stat(note.FilePath); err == nil {
			if saved, err := time.Parse(time.RFC3339, note.UpdatedAt); err == nil {
				// The same second of tolerance the reconciler uses, and for the
				// same reason: updated_at is stored to the second, so the app's
				// own save always looks a fraction newer than it claims to be.
				moved = info.ModTime().After(saved.Add(time.Second))
			}
		}
	}

	if !moved {
		return nil
	}

	return &Conflict{Note: note, OnDisk: string(onDisk), UpdatedAt: note.UpdatedAt}
}
