package projects

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
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

func TestRepositoryCreateNestsFolderInsideItsParent(t *testing.T) {
	db := openProjectsTestDB(t)
	workspaceRoot := t.TempDir()
	insertProjectsTestWorkspace(t, db, "workspace-1", workspaceRoot)

	repo := NewRepository(db, search.NewRepository(db), activities.NewRepository(db))

	parent, err := repo.Create(CreateProjectRequest{WorkspaceID: "workspace-1", Name: "Compiler"})
	if err != nil {
		t.Fatalf("create parent: %v", err)
	}

	if filepath.Dir(parent.FolderPath) != workspaceRoot {
		t.Fatalf("parent dir = %q, want %q", filepath.Dir(parent.FolderPath), workspaceRoot)
	}

	child, err := repo.Create(CreateProjectRequest{
		WorkspaceID: "workspace-1",
		ParentID:    &parent.ID,
		Name:        "Parser",
	})
	if err != nil {
		t.Fatalf("create child: %v", err)
	}

	if filepath.Dir(child.FolderPath) != parent.FolderPath {
		t.Fatalf("child dir = %q, want %q", filepath.Dir(child.FolderPath), parent.FolderPath)
	}

	if child.ParentID == nil || *child.ParentID != parent.ID {
		t.Fatalf("ParentID = %v, want %q", child.ParentID, parent.ID)
	}

	if info, err := os.Stat(child.FolderPath); err != nil || !info.IsDir() {
		t.Fatalf("child folder not created at %q: %v", child.FolderPath, err)
	}

	// A third level proves the path is built from the parent's own path rather
	// than from the workspace root plus one.
	grandchild, err := repo.Create(CreateProjectRequest{
		WorkspaceID: "workspace-1",
		ParentID:    &child.ID,
		Name:        "Recovery",
	})
	if err != nil {
		t.Fatalf("create grandchild: %v", err)
	}

	if filepath.Dir(grandchild.FolderPath) != child.FolderPath {
		t.Fatalf("grandchild dir = %q, want %q", filepath.Dir(grandchild.FolderPath), child.FolderPath)
	}
}

func TestRepositoryUpdateMovesFolderAndCatchesUpDescendantPaths(t *testing.T) {
	db := openProjectsTestDB(t)
	workspaceRoot := t.TempDir()
	insertProjectsTestWorkspace(t, db, "workspace-1", workspaceRoot)

	repo := NewRepository(db, search.NewRepository(db), activities.NewRepository(db))

	parent, err := repo.Create(CreateProjectRequest{WorkspaceID: "workspace-1", Name: "Compiler"})
	if err != nil {
		t.Fatalf("create parent: %v", err)
	}

	child, err := repo.Create(CreateProjectRequest{
		WorkspaceID: "workspace-1",
		ParentID:    &parent.ID,
		Name:        "Parser",
	})
	if err != nil {
		t.Fatalf("create child: %v", err)
	}

	// A note two levels down: its recorded path has to follow the move even
	// though nothing touches the note itself.
	notePath := filepath.Join(child.FolderPath, "notes-note-1.md")
	if err := os.WriteFile(notePath, []byte("body"), 0644); err != nil {
		t.Fatalf("write note file: %v", err)
	}
	insertProjectsTestNoteAt(t, db, "note-1", "workspace-1", child.ID, "Notes", notePath)

	name := "Compiler Lab"
	renamed, err := repo.Update(parent.ID, UpdateProjectRequest{Name: &name})
	if err != nil {
		t.Fatalf("rename parent: %v", err)
	}

	if renamed.FolderPath == parent.FolderPath {
		t.Fatalf("FolderPath unchanged at %q", renamed.FolderPath)
	}

	if filepath.Base(renamed.FolderPath) != "compiler-lab-"+parent.ID {
		t.Fatalf("FolderPath base = %q", filepath.Base(renamed.FolderPath))
	}

	if _, err := os.Stat(parent.FolderPath); !os.IsNotExist(err) {
		t.Fatalf("old folder left behind at %q, stat err = %v", parent.FolderPath, err)
	}

	var childPath string
	if err := db.QueryRow(`SELECT folder_path FROM projects WHERE id = ?`, child.ID).Scan(&childPath); err != nil {
		t.Fatalf("select child folder_path: %v", err)
	}

	wantChild := filepath.Join(renamed.FolderPath, filepath.Base(child.FolderPath))
	if childPath != wantChild {
		t.Fatalf("child folder_path = %q, want %q", childPath, wantChild)
	}

	var storedNotePath string
	if err := db.QueryRow(`SELECT file_path FROM notes WHERE id = 'note-1'`).Scan(&storedNotePath); err != nil {
		t.Fatalf("select note file_path: %v", err)
	}

	wantNote := filepath.Join(wantChild, "notes-note-1.md")
	if storedNotePath != wantNote {
		t.Fatalf("note file_path = %q, want %q", storedNotePath, wantNote)
	}

	// The rows are only correct if they point at files that are really there.
	if _, err := os.Stat(storedNotePath); err != nil {
		t.Fatalf("note file missing at recorded path %q: %v", storedNotePath, err)
	}
}

func TestRepositoryUpdateReparentsFolderAndRejectsCycles(t *testing.T) {
	db := openProjectsTestDB(t)
	workspaceRoot := t.TempDir()
	insertProjectsTestWorkspace(t, db, "workspace-1", workspaceRoot)

	repo := NewRepository(db, search.NewRepository(db), activities.NewRepository(db))

	outer, err := repo.Create(CreateProjectRequest{WorkspaceID: "workspace-1", Name: "Compiler"})
	if err != nil {
		t.Fatalf("create outer: %v", err)
	}

	inner, err := repo.Create(CreateProjectRequest{
		WorkspaceID: "workspace-1",
		ParentID:    &outer.ID,
		Name:        "Parser",
	})
	if err != nil {
		t.Fatalf("create inner: %v", err)
	}

	loose, err := repo.Create(CreateProjectRequest{WorkspaceID: "workspace-1", Name: "Notes"})
	if err != nil {
		t.Fatalf("create loose: %v", err)
	}

	moved, err := repo.Update(loose.ID, UpdateProjectRequest{
		ParentID: OptionalParentID{Set: true, Value: &inner.ID},
	})
	if err != nil {
		t.Fatalf("move folder: %v", err)
	}

	if filepath.Dir(moved.FolderPath) != inner.FolderPath {
		t.Fatalf("dir = %q, want %q", filepath.Dir(moved.FolderPath), inner.FolderPath)
	}

	if _, err := os.Stat(loose.FolderPath); !os.IsNotExist(err) {
		t.Fatalf("old folder left behind at %q, stat err = %v", loose.FolderPath, err)
	}

	// An explicit null takes it back out to the workspace root.
	atRoot, err := repo.Update(loose.ID, UpdateProjectRequest{
		ParentID: OptionalParentID{Set: true, Value: nil},
	})
	if err != nil {
		t.Fatalf("move folder to root: %v", err)
	}

	if filepath.Dir(atRoot.FolderPath) != workspaceRoot {
		t.Fatalf("dir = %q, want %q", filepath.Dir(atRoot.FolderPath), workspaceRoot)
	}

	// Into itself.
	if _, err := repo.Update(outer.ID, UpdateProjectRequest{
		ParentID: OptionalParentID{Set: true, Value: &outer.ID},
	}); !errors.Is(err, ErrParentCycle) {
		t.Fatalf("self-move err = %v, want ErrParentCycle", err)
	}

	// Into its own descendant, which is the case a direct-child check misses.
	if _, err := repo.Update(outer.ID, UpdateProjectRequest{
		ParentID: OptionalParentID{Set: true, Value: &inner.ID},
	}); !errors.Is(err, ErrParentCycle) {
		t.Fatalf("descendant-move err = %v, want ErrParentCycle", err)
	}

	// A rejected move must leave the folder exactly where it was.
	if _, err := os.Stat(outer.FolderPath); err != nil {
		t.Fatalf("outer folder disturbed at %q: %v", outer.FolderPath, err)
	}
}

func TestRepositoryCreateRejectsUnknownParent(t *testing.T) {
	db := openProjectsTestDB(t)
	insertProjectsTestWorkspace(t, db, "workspace-1", t.TempDir())

	repo := NewRepository(db, search.NewRepository(db), activities.NewRepository(db))
	missing := "project-does-not-exist"

	if _, err := repo.Create(CreateProjectRequest{
		WorkspaceID: "workspace-1",
		ParentID:    &missing,
		Name:        "Orphan",
	}); !errors.Is(err, ErrParentNotFound) {
		t.Fatalf("err = %v, want ErrParentNotFound", err)
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
			parent_id TEXT,
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

	// A real directory, because renaming a folder now moves it.
	folderPath := filepath.Join(t.TempDir(), id)
	if err := os.MkdirAll(folderPath, 0755); err != nil {
		t.Fatalf("create project folder: %v", err)
	}

	_, err := db.Exec(`
		INSERT INTO projects (id, workspace_id, name, description, folder_path, status, started_at, ended_at, created_at, updated_at, deleted_at, version, sync_status)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, id, workspaceID, name, description, folderPath, "active", nil, nil, "2026-05-26T00:00:00Z", "2026-05-26T00:00:00Z", nil, 1, "local")
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

func insertProjectsTestNoteAt(t *testing.T, db *sql.DB, id string, workspaceID string, projectID string, title string, filePath string) {
	t.Helper()

	if _, err := db.Exec(`
		INSERT INTO notes (id, workspace_id, project_id, title, file_path, content_type, note_type, created_at, updated_at, deleted_at, version, sync_status)
		VALUES (?, ?, ?, ?, ?, 'markdown', 'project', '2026-05-26T00:00:00Z', '2026-05-26T00:00:00Z', NULL, 1, 'local')
	`, id, workspaceID, projectID, title, filePath); err != nil {
		t.Fatalf("insert note: %v", err)
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
