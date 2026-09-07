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
	"strings"
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

	// The name, and nothing else — no identifier appended.
	if filepath.Base(renamed.FolderPath) != "compiler-lab" {
		t.Fatalf("FolderPath base = %q", filepath.Base(renamed.FolderPath))
	}
	if strings.Contains(filepath.Base(renamed.FolderPath), parent.ID) {
		t.Errorf("the folder name still carries the id: %q", filepath.Base(renamed.FolderPath))
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

// "Notes stay in the workspace root, but the folder itself will be removed" is
// what the confirm button says. Both halves are about the folder somebody opens
// in Finder, so both have to be true there and not only in the database.
func TestDeletingAFolderEmptiesItOntoDiskAndRemovesTheDirectory(t *testing.T) {
	db := openProjectsTestDB(t)
	root := t.TempDir()
	insertProjectsTestWorkspace(t, db, "workspace-1", root)
	insertProjectsTestProject(t, db, "project-1", "workspace-1", "Compiler Lab", "")
	insertProjectsTestNote(t, db, "note-1", "workspace-1", "project-1", "Parsing")

	var folderPath, before string
	if err := db.QueryRow(
		`SELECT folder_path FROM projects WHERE id = 'project-1'`,
	).Scan(&folderPath); err != nil {
		t.Fatalf("read folder: %v", err)
	}
	if err := db.QueryRow(`SELECT file_path FROM notes WHERE id = 'note-1'`).Scan(&before); err != nil {
		t.Fatalf("read note path: %v", err)
	}

	repo := NewRepository(db, search.NewRepository(db), activities.NewRepository(db))
	if err := repo.Delete("project-1", DeleteProjectRequest{DeleteNotes: false}); err != nil {
		t.Fatalf("delete project: %v", err)
	}

	var after string
	if err := db.QueryRow(`SELECT file_path FROM notes WHERE id = 'note-1'`).Scan(&after); err != nil {
		t.Fatalf("read note path: %v", err)
	}

	// At the root, where the row has always claimed it was.
	if filepath.Dir(after) != root {
		t.Errorf("note file is at %q, want it in %q", after, root)
	}
	if _, err := os.Stat(after); err != nil {
		t.Errorf("nothing at the note's new path: %v", err)
	}
	if _, err := os.Stat(before); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("the note is still in the deleted folder too: Stat err = %v", err)
	}
	if _, err := os.Stat(folderPath); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("the folder is still on disk: Stat err = %v", err)
	}
}

// A subfolder used to keep a parent that no longer existed, which took it out
// of the tree the sidebar builds: in the database, absent from the app, and on
// disk inside a directory the app said it had removed.
func TestDeletingAFolderLiftsItsSubfoldersToTheRoot(t *testing.T) {
	db := openProjectsTestDB(t)
	root := t.TempDir()
	insertProjectsTestWorkspace(t, db, "workspace-1", root)
	insertProjectsTestProject(t, db, "parent", "workspace-1", "Parent", "")

	repo := NewRepository(db, search.NewRepository(db), activities.NewRepository(db))

	parentID := "parent"
	child, err := repo.Create(CreateProjectRequest{
		WorkspaceID: "workspace-1",
		ParentID:    &parentID,
		Name:        "Child",
	})
	if err != nil {
		t.Fatalf("create child: %v", err)
	}

	// A note inside the child, to prove the move carries what is under it.
	insertProjectsTestNoteAt(
		t, db, "note-1", "workspace-1", child.ID, "Deep",
		filepath.Join(child.FolderPath, "deep.md"),
	)
	if err := os.WriteFile(filepath.Join(child.FolderPath, "deep.md"), []byte("x"), 0644); err != nil {
		t.Fatalf("write note file: %v", err)
	}

	if err := repo.Delete("parent", DeleteProjectRequest{DeleteNotes: false}); err != nil {
		t.Fatalf("delete parent: %v", err)
	}

	var childParent *string
	var childPath string
	if err := db.QueryRow(
		`SELECT parent_id, folder_path FROM projects WHERE id = ?`, child.ID,
	).Scan(&childParent, &childPath); err != nil {
		t.Fatalf("read child: %v", err)
	}

	if childParent != nil {
		t.Errorf("child still points at a deleted parent: %v", *childParent)
	}
	if filepath.Dir(childPath) != root {
		t.Errorf("child folder is at %q, want it in %q", childPath, root)
	}
	if _, err := os.Stat(childPath); err != nil {
		t.Errorf("the child folder is not where its row says: %v", err)
	}

	// The note travelled with the directory, and its stored path caught up.
	var notePath string
	if err := db.QueryRow(`SELECT file_path FROM notes WHERE id = 'note-1'`).Scan(&notePath); err != nil {
		t.Fatalf("read note path: %v", err)
	}
	if filepath.Dir(notePath) != childPath {
		t.Errorf("note file is at %q, want it under %q", notePath, childPath)
	}
	if _, err := os.Stat(notePath); err != nil {
		t.Errorf("nothing at the note's new path: %v", err)
	}
}

// Removing the directory is os.Remove and not os.RemoveAll, and the difference
// is the whole point: whatever is left in there is something this app did not
// put there, and deleting somebody's file because it was in the way is not a
// thing to do quietly.
func TestAFolderHoldingSomethingTheAppDidNotPutThereIsNotDeleted(t *testing.T) {
	db := openProjectsTestDB(t)
	root := t.TempDir()
	insertProjectsTestWorkspace(t, db, "workspace-1", root)
	insertProjectsTestProject(t, db, "project-1", "workspace-1", "Scans", "")

	var folderPath string
	if err := db.QueryRow(
		`SELECT folder_path FROM projects WHERE id = 'project-1'`,
	).Scan(&folderPath); err != nil {
		t.Fatalf("read folder: %v", err)
	}

	stranger := filepath.Join(folderPath, "receipt.pdf")
	if err := os.WriteFile(stranger, []byte("%PDF"), 0644); err != nil {
		t.Fatalf("write: %v", err)
	}

	repo := NewRepository(db, search.NewRepository(db), activities.NewRepository(db))
	if err := repo.Delete("project-1", DeleteProjectRequest{DeleteNotes: false}); err == nil {
		t.Fatal("deleted a folder that still held a file the app does not manage")
	}

	// Nothing happened: the file is there, the folder is there, and so is the
	// row, so the app and the folder still agree with each other.
	if _, err := os.Stat(stranger); err != nil {
		t.Errorf("the file was removed anyway: %v", err)
	}

	var deletedAt *string
	if err := db.QueryRow(
		`SELECT deleted_at FROM projects WHERE id = 'project-1'`,
	).Scan(&deletedAt); err != nil {
		t.Fatalf("read project: %v", err)
	}
	if deletedAt != nil {
		t.Error("the folder was deleted in the database but not on disk")
	}
}

// .DS_Store is not a reason to refuse. macOS writes one into any folder that
// has been looked at, and it comes back on sight.
func TestAFolderHoldingOnlyOperatingSystemLeftoversIsDeleted(t *testing.T) {
	db := openProjectsTestDB(t)
	root := t.TempDir()
	insertProjectsTestWorkspace(t, db, "workspace-1", root)
	insertProjectsTestProject(t, db, "project-1", "workspace-1", "Looked At", "")

	var folderPath string
	if err := db.QueryRow(
		`SELECT folder_path FROM projects WHERE id = 'project-1'`,
	).Scan(&folderPath); err != nil {
		t.Fatalf("read folder: %v", err)
	}
	if err := os.WriteFile(filepath.Join(folderPath, ".DS_Store"), []byte("x"), 0644); err != nil {
		t.Fatalf("write: %v", err)
	}

	repo := NewRepository(db, search.NewRepository(db), activities.NewRepository(db))
	if err := repo.Delete("project-1", DeleteProjectRequest{DeleteNotes: false}); err != nil {
		t.Fatalf("delete project: %v", err)
	}

	if _, err := os.Stat(folderPath); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("the folder is still on disk: Stat err = %v", err)
	}
}

// Asking for the notes to go too takes their files with them, the same bargain
// deleting one note on its own strikes.
func TestDeletingAFolderWithItsNotesRemovesTheirFiles(t *testing.T) {
	db := openProjectsTestDB(t)
	insertProjectsTestWorkspace(t, db, "workspace-1", t.TempDir())
	insertProjectsTestProject(t, db, "project-1", "workspace-1", "Project", "")
	insertProjectsTestNote(t, db, "note-1", "workspace-1", "project-1", "Note")

	var notePath, folderPath string
	if err := db.QueryRow(`SELECT file_path FROM notes WHERE id = 'note-1'`).Scan(&notePath); err != nil {
		t.Fatalf("read note path: %v", err)
	}
	if err := db.QueryRow(
		`SELECT folder_path FROM projects WHERE id = 'project-1'`,
	).Scan(&folderPath); err != nil {
		t.Fatalf("read folder: %v", err)
	}

	repo := NewRepository(db, search.NewRepository(db), activities.NewRepository(db))
	if err := repo.Delete("project-1", DeleteProjectRequest{DeleteNotes: true}); err != nil {
		t.Fatalf("delete project: %v", err)
	}

	if _, err := os.Stat(notePath); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("the note file survived: Stat err = %v", err)
	}
	if _, err := os.Stat(folderPath); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("the folder is still on disk: Stat err = %v", err)
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

	// A real directory inside the workspace it belongs to. Renaming a folder
	// moves it, and deleting one now moves what it holds up to the workspace
	// root and then removes the directory — neither of which means anything if
	// the folder is off in a temporary directory of its own.
	folderPath := filepath.Join(projectsTestWorkspaceRoot(t, db, workspaceID), id)
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

func projectsTestWorkspaceRoot(t *testing.T, db *sql.DB, workspaceID string) string {
	t.Helper()

	var rootPath string
	if err := db.QueryRow(
		`SELECT root_path FROM workspaces WHERE id = ?`, workspaceID,
	).Scan(&rootPath); err != nil {
		t.Fatalf("read workspace root: %v", err)
	}

	return rootPath
}

func insertProjectsTestNote(t *testing.T, db *sql.DB, id string, workspaceID string, projectID string, title string) {
	t.Helper()

	var folderPath string
	if err := db.QueryRow(
		`SELECT folder_path FROM projects WHERE id = ?`, projectID,
	).Scan(&folderPath); err != nil {
		t.Fatalf("read project folder: %v", err)
	}

	// A real file in the folder that holds it. Deleting the folder moves this
	// one, so a path pointing at nothing would be testing bookkeeping and
	// nothing else.
	filePath := filepath.Join(folderPath, id+".md")
	if err := os.WriteFile(filePath, []byte(title), 0644); err != nil {
		t.Fatalf("write note file: %v", err)
	}

	_, err := db.Exec(`
		INSERT INTO notes (id, workspace_id, project_id, title, file_path, content_type, note_type, created_at, updated_at, deleted_at, version, sync_status)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, id, workspaceID, projectID, title, filePath, "markdown", "project", "2026-05-26T00:00:00Z", "2026-05-26T00:00:00Z", nil, 1, "local")
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
