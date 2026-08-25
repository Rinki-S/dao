package tasks

import (
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"time"

	"github.com/rinki-s/dao/apps/local-service/internal/modules/activities"
	"github.com/rinki-s/dao/apps/local-service/internal/modules/search"
)

// DocumentFileName is fixed rather than derived from a title, because this file
// is not something the app lets you rename: there is exactly one per workspace
// and the workspace already names it.
const DocumentFileName = "tasks.md"

// The heading is what a new file opens with, so the editor is never a blank
// page and the file explains itself when opened outside the app.
const emptyDocument = "# Tasks\n\n"

// ErrWorkspaceNotFound separates an unknown workspace from a missing file,
// which both surface as an error from the same call otherwise.
var ErrWorkspaceNotFound = errors.New("workspace not found")

type Repository struct {
	db       *sql.DB
	indexer  search.Indexer
	activity *activities.Repository
}

func NewRepository(db *sql.DB, indexer search.Indexer, activity *activities.Repository) *Repository {
	return &Repository{activity: activity, db: db, indexer: indexer}
}

// Get returns the workspace's task document, creating the file the first time
// it is asked for. Opening Tasks should never fail because nobody has written
// a task yet.
func (r *Repository) Get(workspaceID string) (Document, error) {
	filePath, err := r.documentPath(workspaceID)
	if err != nil {
		return Document{}, err
	}

	content, err := os.ReadFile(filePath)
	if errors.Is(err, os.ErrNotExist) {
		if err := os.WriteFile(filePath, []byte(emptyDocument), 0644); err != nil {
			return Document{}, err
		}

		content = []byte(emptyDocument)
	} else if err != nil {
		return Document{}, err
	}

	info, err := os.Stat(filePath)
	if err != nil {
		return Document{}, err
	}

	return Document{
		Content:     string(content),
		FilePath:    filePath,
		UpdatedAt:   info.ModTime().UTC().Format(time.RFC3339),
		WorkspaceID: workspaceID,
	}, nil
}

// Update replaces the document. The previous content is restored if indexing
// fails, so the file and the index cannot disagree about what was saved.
func (r *Repository) Update(workspaceID string, content string) (Document, error) {
	filePath, err := r.documentPath(workspaceID)
	if err != nil {
		return Document{}, err
	}

	previous, readErr := os.ReadFile(filePath)
	existed := readErr == nil
	if readErr != nil && !errors.Is(readErr, os.ErrNotExist) {
		return Document{}, readErr
	}

	if err := os.WriteFile(filePath, []byte(content), 0644); err != nil {
		return Document{}, err
	}

	committed := false
	defer func() {
		if committed {
			return
		}

		if existed {
			_ = os.WriteFile(filePath, previous, 0644)
		} else {
			_ = os.Remove(filePath)
		}
	}()

	now := time.Now().UTC().Format(time.RFC3339)

	tx, err := r.db.Begin()
	if err != nil {
		return Document{}, err
	}
	defer tx.Rollback()

	if err := r.indexDocumentTx(tx, workspaceID, content, now); err != nil {
		return Document{}, err
	}

	if err := tx.Commit(); err != nil {
		return Document{}, err
	}

	committed = true

	return Document{
		Content:     content,
		FilePath:    filePath,
		UpdatedAt:   now,
		WorkspaceID: workspaceID,
	}, nil
}

// The document is one search entry per workspace rather than one per task:
// a task has no id to index by any more, and the whole file is what a hit
// opens.
func (r *Repository) indexDocumentTx(tx *sql.Tx, workspaceID string, content string, now string) error {
	return r.indexer.ReplaceTx(tx, search.IndexEntry{
		Body:        content,
		CreatedAt:   now,
		EntityID:    workspaceID,
		EntityType:  "task",
		Title:       "Tasks",
		UpdatedAt:   now,
		WorkspaceID: workspaceID,
	})
}

func (r *Repository) documentPath(workspaceID string) (string, error) {
	var rootPath string
	if err := r.db.QueryRow(`
		SELECT root_path
		FROM workspaces
		WHERE id = ? AND deleted_at IS NULL
	`, workspaceID).Scan(&rootPath); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", ErrWorkspaceNotFound
		}

		return "", err
	}

	return filepath.Join(rootPath, DocumentFileName), nil
}
