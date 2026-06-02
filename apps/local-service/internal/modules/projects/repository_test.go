package projects

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/rinki-s/dao/apps/local-service/internal/modules/activities"
	"github.com/rinki-s/dao/apps/local-service/internal/modules/search"

	_ "modernc.org/sqlite"
)

func TestRepositoryUpdateRenamesProjectAndReplacesSearchIndex(t *testing.T) {
	db := openProjectsTestDB(t)
	insertProjectsTestWorkspace(t, db, "workspace-1", t.TempDir())
	insertProjectsTestProject(t, db, "project-1", "workspace-1", "Original", "Before")

	repo := NewRepository(db, search.NewRepository(db), activities.NewRepository(db))
	name := "Renamed"
	description := "After"

	project, err := repo.Update("project-1", UpdateProjectRequest{
		Name:        &name,
		Description: &description,
	})
	if err != nil {
		t.Fatalf("update project: %v", err)
	}

	if project.Name != "Renamed" || project.Description != "After" {
		t.Fatalf("project = %#v", project)
	}
	if project.Version != 2 {
		t.Fatalf("Version = %d, want 2", project.Version)
	}

	var title string
	if err := db.QueryRow(`SELECT title FROM search_index WHERE entity_type = 'project' AND entity_id = 'project-1'`).Scan(&title); err != nil {
		t.Fatalf("query search title: %v", err)
	}
	if title != "Renamed" {
		t.Fatalf("search title = %q, want Renamed", title)
	}
}

func TestRepositoryDeleteKeepsNotesByUnassigningThem(t *testing.T) {
	db := openProjectsTestDB(t)
	insertProjectsTestWorkspace(t, db, "workspace-1", t.TempDir())
	insertProjectsTestProject(t, db, "project-1", "workspace-1", "Project", "")
	insertProjectsTestNote(t, db, "note-1", "workspace-1", "project-1", "Note")

	repo := NewRepository(db, search.NewRepository(db), activities.NewRepository(db))

	if err := repo.Delete("project-1", DeleteProjectRequest{DeleteNotes: false}); err != nil {
		t.Fatalf("delete project: %v", err)
	}

	var projectDeletedAt *string
	if err := db.QueryRow(`SELECT deleted_at FROM projects WHERE id = 'project-1'`).Scan(&projectDeletedAt); err != nil {
		t.Fatalf("query project deleted_at: %v", err)
	}
	if projectDeletedAt == nil {
		t.Fatal("project deleted_at was not set")
	}

	var noteProjectID *string
	var noteDeletedAt *string
	if err := db.QueryRow(`SELECT project_id, deleted_at FROM notes WHERE id = 'note-1'`).Scan(&noteProjectID, &noteDeletedAt); err != nil {
		t.Fatalf("query note: %v", err)
	}
	if noteProjectID != nil {
		t.Fatalf("note project_id = %v, want nil", *noteProjectID)
	}
	if noteDeletedAt != nil {
		t.Fatalf("note deleted_at = %v, want nil", *noteDeletedAt)
	}

	var noteSearchProjectID *string
	if err := db.QueryRow(`SELECT project_id FROM search_index WHERE entity_type = 'note' AND entity_id = 'note-1'`).Scan(&noteSearchProjectID); err != nil {
		t.Fatalf("query note search project_id: %v", err)
	}
	if noteSearchProjectID != nil {
		t.Fatalf("note search project_id = %v, want nil", *noteSearchProjectID)
	}
}

func TestRepositoryDeleteCanDeleteProjectNotes(t *testing.T) {
	db := openProjectsTestDB(t)
	insertProjectsTestWorkspace(t, db, "workspace-1", t.TempDir())
	insertProjectsTestProject(t, db, "project-1", "workspace-1", "Project", "")
	insertProjectsTestNote(t, db, "note-1", "workspace-1", "project-1", "Note")

	repo := NewRepository(db, search.NewRepository(db), activities.NewRepository(db))

	if err := repo.Delete("project-1", DeleteProjectRequest{DeleteNotes: true}); err != nil {
		t.Fatalf("delete project: %v", err)
	}

	var noteDeletedAt *string
	if err := db.QueryRow(`SELECT deleted_at FROM notes WHERE id = 'note-1'`).Scan(&noteDeletedAt); err != nil {
		t.Fatalf("query note deleted_at: %v", err)
	}
	if noteDeletedAt == nil {
		t.Fatal("note deleted_at was not set")
	}

	var searchCount int
	if err := db.QueryRow(`SELECT COUNT(*) FROM search_index WHERE entity_type = 'note' AND entity_id = 'note-1'`).Scan(&searchCount); err != nil {
		t.Fatalf("query note search count: %v", err)
	}
	if searchCount != 0 {
		t.Fatalf("note search rows = %d, want 0", searchCount)
	}
}

func TestHandlerUpdateProject(t *testing.T) {
	db := openProjectsTestDB(t)
	insertProjectsTestWorkspace(t, db, "workspace-1", t.TempDir())
	insertProjectsTestProject(t, db, "project-1", "workspace-1", "Original", "")

	repo := NewRepository(db, search.NewRepository(db), activities.NewRepository(db))
	mux := http.NewServeMux()
	NewHandler(repo).RegisterRoutes(mux)

	req := httptest.NewRequest(http.MethodPatch, "/api/projects/project-1", bytes.NewBufferString(`{"name":"Renamed"}`))
	rec := httptest.NewRecorder()

	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body = %s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var project Project
	if err := json.NewDecoder(rec.Body).Decode(&project); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if project.Name != "Renamed" {
		t.Fatalf("Name = %q, want Renamed", project.Name)
	}
}

func TestHandlerDeleteProjectWithDeleteNotesOption(t *testing.T) {
	db := openProjectsTestDB(t)
	insertProjectsTestWorkspace(t, db, "workspace-1", t.TempDir())
	insertProjectsTestProject(t, db, "project-1", "workspace-1", "Project", "")
	insertProjectsTestNote(t, db, "note-1", "workspace-1", "project-1", "Note")

	repo := NewRepository(db, search.NewRepository(db), activities.NewRepository(db))
	mux := http.NewServeMux()
	NewHandler(repo).RegisterRoutes(mux)

	req := httptest.NewRequest(http.MethodDelete, "/api/projects/project-1", bytes.NewBufferString(`{"deleteNotes":true}`))
	rec := httptest.NewRecorder()

	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d; body = %s", rec.Code, http.StatusNoContent, rec.Body.String())
	}

	var noteDeletedAt *string
	if err := db.QueryRow(`SELECT deleted_at FROM notes WHERE id = 'note-1'`).Scan(&noteDeletedAt); err != nil {
		t.Fatalf("query note deleted_at: %v", err)
	}
	if noteDeletedAt == nil {
		t.Fatal("note deleted_at was not set")
	}
}

func openProjectsTestDB(t *testing.T) *sql.DB {
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

		CREATE VIRTUAL TABLE search_index USING fts5(
			entity_type UNINDEXED,
			entity_id UNINDEXED,
			workspace_id UNINDEXED,
			project_id UNINDEXED,
			title,
			body,
			created_at UNINDEXED,
			updated_at UNINDEXED
		);
	`)
	if err != nil {
		t.Fatalf("create test schema: %v", err)
	}

	return db
}

func insertProjectsTestWorkspace(t *testing.T, db *sql.DB, id string, rootPath string) {
	t.Helper()

	_, err := db.Exec(`
		INSERT INTO workspaces (id, name, description, root_path, created_at, updated_at, deleted_at, version, sync_status)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, id, "Workspace", "", rootPath, "2026-05-26T00:00:00Z", "2026-05-26T00:00:00Z", nil, 1, "local")
	if err != nil {
		t.Fatalf("insert workspace: %v", err)
	}
}

func insertProjectsTestProject(t *testing.T, db *sql.DB, id string, workspaceID string, name string, description string) {
	t.Helper()

	_, err := db.Exec(`
		INSERT INTO projects (id, workspace_id, name, description, folder_path, status, started_at, ended_at, created_at, updated_at, deleted_at, version, sync_status)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, id, workspaceID, name, description, "/tmp/"+id, "active", nil, nil, "2026-05-26T00:00:00Z", "2026-05-26T00:00:00Z", nil, 1, "local")
	if err != nil {
		t.Fatalf("insert project: %v", err)
	}

	_, err = db.Exec(`
		INSERT INTO search_index (entity_type, entity_id, workspace_id, project_id, title, body, created_at, updated_at)
		VALUES ('project', ?, ?, ?, ?, ?, '2026-05-26T00:00:00Z', '2026-05-26T00:00:00Z')
	`, id, workspaceID, id, name, description)
	if err != nil {
		t.Fatalf("insert project search row: %v", err)
	}
}

func insertProjectsTestNote(t *testing.T, db *sql.DB, id string, workspaceID string, projectID string, title string) {
	t.Helper()

	_, err := db.Exec(`
		INSERT INTO notes (id, workspace_id, project_id, title, file_path, content_type, note_type, created_at, updated_at, deleted_at, version, sync_status)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, id, workspaceID, projectID, title, "/tmp/"+id+".md", "markdown", "project", "2026-05-26T00:00:00Z", "2026-05-26T00:00:00Z", nil, 1, "local")
	if err != nil {
		t.Fatalf("insert note: %v", err)
	}

	_, err = db.Exec(`
		INSERT INTO search_index (entity_type, entity_id, workspace_id, project_id, title, body, created_at, updated_at)
		VALUES ('note', ?, ?, ?, ?, '', '2026-05-26T00:00:00Z', '2026-05-26T00:00:00Z')
	`, id, workspaceID, projectID, title)
	if err != nil {
		t.Fatalf("insert note search row: %v", err)
	}
}
