package notes

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/rinki-s/dao/apps/local-service/internal/modules/activities"
	"github.com/rinki-s/dao/apps/local-service/internal/modules/search"

	_ "modernc.org/sqlite"
)

func TestRepositoryCreateWritesProjectMarkdownFile(t *testing.T) {
	db := openNotesTestDB(t)
	workspaceRoot := t.TempDir()
	projectRoot := filepath.Join(workspaceRoot, "dao-project-project-1")

	if err := os.MkdirAll(projectRoot, 0755); err != nil {
		t.Fatalf("create project root: %v", err)
	}

	insertNotesTestWorkspace(t, db, "workspace-1", workspaceRoot)
	insertNotesTestProject(t, db, "project-1", "workspace-1", projectRoot)

	indexer := &captureIndexer{}
	repo := NewRepository(db, indexer, activities.NewRepository(db))
	projectID := "project-1"

	note, err := repo.Create(CreateNoteRequest{
		WorkspaceID: "workspace-1",
		ProjectID:   &projectID,
		Title:       "Parser Design",
		Content:     "# Parser Design\n\nUse Pratt parsing.",
		ContentType: "markdown",
		NoteType:    "project",
	})
	if err != nil {
		t.Fatalf("create note: %v", err)
	}

	if filepath.Dir(note.FilePath) != projectRoot {
		t.Fatalf("FilePath dir = %q, want %q", filepath.Dir(note.FilePath), projectRoot)
	}

	assertFileContent(t, note.FilePath, "# Parser Design\n\nUse Pratt parsing.")

	if len(indexer.entries) != 1 {
		t.Fatalf("len(indexer.entries) = %d, want 1", len(indexer.entries))
	}

	if indexer.entries[0].Body != "# Parser Design\n\nUse Pratt parsing." {
		t.Fatalf("indexed body = %q", indexer.entries[0].Body)
	}
}

func TestRepositoryCreateWritesUnassignedMarkdownFileToWorkspaceRoot(t *testing.T) {
	db := openNotesTestDB(t)
	workspaceRoot := t.TempDir()

	insertNotesTestWorkspace(t, db, "workspace-1", workspaceRoot)

	repo := NewRepository(db, &captureIndexer{}, activities.NewRepository(db))

	note, err := repo.Create(CreateNoteRequest{
		WorkspaceID: "workspace-1",
		ProjectID:   nil,
		Title:       "Reading List",
		Content:     "- Designing Data-Intensive Applications",
		ContentType: "markdown",
		NoteType:    "learning",
	})
	if err != nil {
		t.Fatalf("create note: %v", err)
	}

	if filepath.Dir(note.FilePath) != workspaceRoot {
		t.Fatalf("FilePath dir = %q, want %q", filepath.Dir(note.FilePath), workspaceRoot)
	}

	assertFileContent(t, note.FilePath, "- Designing Data-Intensive Applications")
}

func TestRepositoryGetReadsMarkdownFileContent(t *testing.T) {
	db := openNotesTestDB(t)
	workspaceRoot := t.TempDir()

	insertNotesTestWorkspace(t, db, "workspace-1", workspaceRoot)

	repo := NewRepository(db, &captureIndexer{}, activities.NewRepository(db))

	createdNote, err := repo.Create(CreateNoteRequest{
		WorkspaceID: "workspace-1",
		ProjectID:   nil,
		Title:       "Editor Plan",
		Content:     "# Editor Plan\n\nAutosave first.",
		ContentType: "markdown",
		NoteType:    "general",
	})
	if err != nil {
		t.Fatalf("create note: %v", err)
	}

	note, err := repo.Get(createdNote.ID)
	if err != nil {
		t.Fatalf("get note: %v", err)
	}

	if note.Content != "# Editor Plan\n\nAutosave first." {
		t.Fatalf("Content = %q", note.Content)
	}
}

func TestRepositoryUpdateContentWritesMarkdownFileAndReplacesIndex(t *testing.T) {
	db := openNotesTestDB(t)
	workspaceRoot := t.TempDir()

	insertNotesTestWorkspace(t, db, "workspace-1", workspaceRoot)

	indexer := &captureIndexer{}
	repo := NewRepository(db, indexer, activities.NewRepository(db))

	createdNote, err := repo.Create(CreateNoteRequest{
		WorkspaceID: "workspace-1",
		ProjectID:   nil,
		Title:       "Autosave Plan",
		Content:     "Initial content",
		ContentType: "markdown",
		NoteType:    "general",
	})
	if err != nil {
		t.Fatalf("create note: %v", err)
	}

	updatedNote, err := repo.UpdateContent(createdNote.ID, "Updated content")
	if err != nil {
		t.Fatalf("update content: %v", err)
	}

	if updatedNote.Content != "Updated content" {
		t.Fatalf("updated Content = %q", updatedNote.Content)
	}

	if updatedNote.Version != createdNote.Version+1 {
		t.Fatalf("updated Version = %d, want %d", updatedNote.Version, createdNote.Version+1)
	}

	assertFileContent(t, createdNote.FilePath, "Updated content")

	readNote, err := repo.Get(createdNote.ID)
	if err != nil {
		t.Fatalf("get updated note: %v", err)
	}

	if readNote.Content != "Updated content" {
		t.Fatalf("read Content = %q", readNote.Content)
	}

	if len(indexer.replacedEntries) != 1 {
		t.Fatalf("len(indexer.replacedEntries) = %d, want 1", len(indexer.replacedEntries))
	}

	if indexer.replacedEntries[0].Body != "Updated content" {
		t.Fatalf("replaced body = %q", indexer.replacedEntries[0].Body)
	}
}

func TestHandlerGetNote(t *testing.T) {
	db := openNotesTestDB(t)
	workspaceRoot := t.TempDir()

	insertNotesTestWorkspace(t, db, "workspace-1", workspaceRoot)

	repo := NewRepository(db, &captureIndexer{}, activities.NewRepository(db))
	createdNote, err := repo.Create(CreateNoteRequest{
		WorkspaceID: "workspace-1",
		ProjectID:   nil,
		Title:       "Handler Note",
		Content:     "Handler content",
		ContentType: "markdown",
		NoteType:    "general",
	})
	if err != nil {
		t.Fatalf("create note: %v", err)
	}

	mux := http.NewServeMux()
	NewHandler(repo).RegisterRoutes(mux)

	req := httptest.NewRequest(http.MethodGet, "/api/notes/"+createdNote.ID, nil)
	rec := httptest.NewRecorder()

	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	var note Note
	if err := json.NewDecoder(rec.Body).Decode(&note); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if note.ID != createdNote.ID {
		t.Fatalf("ID = %q, want %q", note.ID, createdNote.ID)
	}

	if note.Content != "Handler content" {
		t.Fatalf("Content = %q", note.Content)
	}
}

func TestHandlerUpdateNoteContent(t *testing.T) {
	db := openNotesTestDB(t)
	workspaceRoot := t.TempDir()

	insertNotesTestWorkspace(t, db, "workspace-1", workspaceRoot)

	repo := NewRepository(db, &captureIndexer{}, activities.NewRepository(db))
	createdNote, err := repo.Create(CreateNoteRequest{
		WorkspaceID: "workspace-1",
		ProjectID:   nil,
		Title:       "Handler Update Note",
		Content:     "Initial handler content",
		ContentType: "markdown",
		NoteType:    "general",
	})
	if err != nil {
		t.Fatalf("create note: %v", err)
	}

	mux := http.NewServeMux()
	NewHandler(repo).RegisterRoutes(mux)

	req := httptest.NewRequest(
		http.MethodPut,
		"/api/notes/"+createdNote.ID+"/content",
		bytes.NewBufferString(`{"content":"Updated handler content"}`),
	)
	rec := httptest.NewRecorder()

	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	var note Note
	if err := json.NewDecoder(rec.Body).Decode(&note); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if note.Content != "Updated handler content" {
		t.Fatalf("Content = %q", note.Content)
	}

	assertFileContent(t, createdNote.FilePath, "Updated handler content")
}

func TestHandlerUpdateNoteContentNotFound(t *testing.T) {
	db := openNotesTestDB(t)
	repo := NewRepository(db, &captureIndexer{}, activities.NewRepository(db))
	mux := http.NewServeMux()
	NewHandler(repo).RegisterRoutes(mux)

	req := httptest.NewRequest(
		http.MethodPut,
		"/api/notes/missing-note/content",
		bytes.NewBufferString(`{"content":"Updated content"}`),
	)
	rec := httptest.NewRecorder()

	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusNotFound)
	}
}

func TestHandlerGetNoteNotFound(t *testing.T) {
	db := openNotesTestDB(t)
	repo := NewRepository(db, &captureIndexer{}, activities.NewRepository(db))
	mux := http.NewServeMux()
	NewHandler(repo).RegisterRoutes(mux)

	req := httptest.NewRequest(http.MethodGet, "/api/notes/missing-note", nil)
	rec := httptest.NewRecorder()

	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusNotFound)
	}
}

type captureIndexer struct {
	entries         []search.IndexEntry
	replacedEntries []search.IndexEntry
}

func (i *captureIndexer) IndexTx(_ *sql.Tx, entry search.IndexEntry) error {
	i.entries = append(i.entries, entry)
	return nil
}

func (i *captureIndexer) ReplaceTx(_ *sql.Tx, entry search.IndexEntry) error {
	i.replacedEntries = append(i.replacedEntries, entry)
	return nil
}

func openNotesTestDB(t *testing.T) *sql.DB {
	t.Helper()

	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() {
		db.Close()
	})

	_, err = db.Exec(`
		CREATE TABLE workspaces (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			description TEXT NOT NULL DEFAULT '',
			root_path TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			deleted_at TEXT,
			version INTEGER NOT NULL DEFAULT 1,
			sync_status TEXT NOT NULL DEFAULT 'local'
		);

		CREATE TABLE projects (
			id TEXT PRIMARY KEY,
			workspace_id TEXT NOT NULL,
			name TEXT NOT NULL,
			description TEXT NOT NULL DEFAULT '',
			folder_path TEXT NOT NULL DEFAULT '',
			status TEXT NOT NULL DEFAULT 'active',
			started_at TEXT,
			ended_at TEXT,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			deleted_at TEXT,
			version INTEGER NOT NULL DEFAULT 1,
			sync_status TEXT NOT NULL DEFAULT 'local'
		);

		CREATE TABLE notes (
			id TEXT PRIMARY KEY,
			workspace_id TEXT NOT NULL,
			project_id TEXT,
			title TEXT NOT NULL,
			content TEXT NOT NULL DEFAULT '',
			file_path TEXT NOT NULL DEFAULT '',
			content_type TEXT NOT NULL DEFAULT 'markdown',
			note_type TEXT NOT NULL DEFAULT 'general',
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			deleted_at TEXT,
			version INTEGER NOT NULL DEFAULT 1,
			sync_status TEXT NOT NULL DEFAULT 'local'
		);

		CREATE TABLE activities (
			id TEXT PRIMARY KEY,
			workspace_id TEXT NOT NULL,
			project_id TEXT,
			entity_type TEXT NOT NULL,
			entity_id TEXT NOT NULL,
			action TEXT NOT NULL,
			metadata_json TEXT NOT NULL DEFAULT '{}',
			created_at TEXT NOT NULL
		);
	`)
	if err != nil {
		t.Fatalf("create test schema: %v", err)
	}

	return db
}

func insertNotesTestWorkspace(t *testing.T, db *sql.DB, id string, rootPath string) {
	t.Helper()

	_, err := db.Exec(`
		INSERT INTO workspaces (
			id, name, description, root_path, created_at, updated_at, deleted_at, version, sync_status
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, id, "Workspace", "", rootPath, "2026-05-26T00:00:00Z", "2026-05-26T00:00:00Z", nil, 1, "local")
	if err != nil {
		t.Fatalf("insert workspace: %v", err)
	}
}

func insertNotesTestProject(t *testing.T, db *sql.DB, id string, workspaceID string, folderPath string) {
	t.Helper()

	_, err := db.Exec(`
		INSERT INTO projects (
			id, workspace_id, name, description, folder_path, status, started_at, ended_at, created_at, updated_at, deleted_at, version, sync_status
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, id, workspaceID, "Project", "", folderPath, "active", nil, nil, "2026-05-26T00:00:00Z", "2026-05-26T00:00:00Z", nil, 1, "local")
	if err != nil {
		t.Fatalf("insert project: %v", err)
	}
}

func assertFileContent(t *testing.T, path string, want string) {
	t.Helper()

	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read file %q: %v", path, err)
	}

	if string(content) != want {
		t.Fatalf("file content = %q, want %q", string(content), want)
	}
}
