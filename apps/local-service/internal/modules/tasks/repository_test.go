package tasks

import (
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/rinki-s/dao/apps/local-service/internal/modules/activities"
	"github.com/rinki-s/dao/apps/local-service/internal/modules/search"

	_ "modernc.org/sqlite"
)

func TestRepositoryGetCreatesTheFileOnFirstRead(t *testing.T) {
	db := openTasksTestDB(t)
	workspaceRoot := t.TempDir()
	insertTasksTestWorkspace(t, db, "workspace-1", workspaceRoot)

	repo := newTasksTestRepository(db)

	document, err := repo.Get("workspace-1")
	if err != nil {
		t.Fatalf("get document: %v", err)
	}

	wantPath := filepath.Join(workspaceRoot, "tasks.md")
	if document.FilePath != wantPath {
		t.Fatalf("FilePath = %q, want %q", document.FilePath, wantPath)
	}

	// Opening Tasks before writing one must not fail, and must not leave the
	// editor on a blank page.
	if !strings.Contains(document.Content, "# Tasks") {
		t.Fatalf("Content = %q", document.Content)
	}

	if _, err := os.Stat(wantPath); err != nil {
		t.Fatalf("file not created at %q: %v", wantPath, err)
	}
}

func TestRepositoryUpdateWritesTheFileAndIndexesItOnce(t *testing.T) {
	db := openTasksTestDB(t)
	workspaceRoot := t.TempDir()
	insertTasksTestWorkspace(t, db, "workspace-1", workspaceRoot)

	repo := newTasksTestRepository(db)
	content := "# Tasks\n\n- [ ] Fix parser recovery @due(2026-08-25) !high\n"

	if _, err := repo.Update("workspace-1", content); err != nil {
		t.Fatalf("update document: %v", err)
	}

	written, err := os.ReadFile(filepath.Join(workspaceRoot, "tasks.md"))
	if err != nil {
		t.Fatalf("read file: %v", err)
	}
	if string(written) != content {
		t.Fatalf("file = %q, want %q", string(written), content)
	}

	// Saving twice must not leave two entries: the document replaces itself
	// rather than accumulating one row per save.
	if _, err := repo.Update("workspace-1", content+"- [x] Ship v2\n"); err != nil {
		t.Fatalf("update document again: %v", err)
	}

	var indexed int
	if err := db.QueryRow(`SELECT COUNT(*) FROM search_index WHERE entity_type = 'task'`).Scan(&indexed); err != nil {
		t.Fatalf("count index rows: %v", err)
	}
	if indexed != 1 {
		t.Fatalf("search rows = %d, want 1", indexed)
	}
}

func TestRepositoryGetRejectsAnUnknownWorkspace(t *testing.T) {
	db := openTasksTestDB(t)
	repo := newTasksTestRepository(db)

	if _, err := repo.Get("workspace-does-not-exist"); err != ErrWorkspaceNotFound {
		t.Fatalf("err = %v, want ErrWorkspaceNotFound", err)
	}
}

func TestMigrateRowsToDocumentsMovesRowsIntoTheFile(t *testing.T) {
	db := openTasksTestDB(t)
	workspaceRoot := t.TempDir()
	insertTasksTestWorkspace(t, db, "workspace-1", workspaceRoot)

	insertTasksTestRow(t, db, taskRow{
		id:       "task-1",
		title:    "Fix parser recovery",
		status:   "todo",
		priority: "high",
		dueDate:  "2026-08-25",
	})
	insertTasksTestRow(t, db, taskRow{
		id:       "task-2",
		parentID: "task-1",
		title:    "Add error fixtures",
		status:   "done",
		priority: "medium",
	})
	insertTasksTestRow(t, db, taskRow{
		id:       "task-3",
		title:    "Ship v2",
		status:   "todo",
		priority: "low",
	})

	repo := newTasksTestRepository(db)

	if err := MigrateRowsToDocuments(db, repo); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	document, err := repo.Get("workspace-1")
	if err != nil {
		t.Fatalf("get document: %v", err)
	}

	want := "# Tasks\n\n" +
		"- [ ] Fix parser recovery @due(2026-08-25) !high\n" +
		"  - [x] Add error fixtures\n" +
		"- [ ] Ship v2 !low\n"

	if document.Content != want {
		t.Fatalf("Content =\n%q\nwant\n%q", document.Content, want)
	}

	// The rows were the only copy until the file existed; now they are not a
	// second one that could drift.
	var remaining int
	if err := db.QueryRow(`SELECT COUNT(*) FROM tasks`).Scan(&remaining); err != nil {
		t.Fatalf("count rows: %v", err)
	}
	if remaining != 0 {
		t.Fatalf("rows = %d, want 0", remaining)
	}
}

func TestMigrateRowsToDocumentsLeavesAnAlreadyWrittenFileAlone(t *testing.T) {
	db := openTasksTestDB(t)
	workspaceRoot := t.TempDir()
	insertTasksTestWorkspace(t, db, "workspace-1", workspaceRoot)

	repo := newTasksTestRepository(db)
	existing := "# Tasks\n\n- [ ] Written by hand\n"

	if _, err := repo.Update("workspace-1", existing); err != nil {
		t.Fatalf("seed document: %v", err)
	}

	insertTasksTestRow(t, db, taskRow{id: "task-1", title: "From a row", status: "todo", priority: "medium"})

	if err := MigrateRowsToDocuments(db, repo); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	document, err := repo.Get("workspace-1")
	if err != nil {
		t.Fatalf("get document: %v", err)
	}

	if document.Content != existing {
		t.Fatalf("Content = %q, want it untouched at %q", document.Content, existing)
	}

	// The rows stay put rather than being dropped on the floor.
	var remaining int
	if err := db.QueryRow(`SELECT COUNT(*) FROM tasks`).Scan(&remaining); err != nil {
		t.Fatalf("count rows: %v", err)
	}
	if remaining != 1 {
		t.Fatalf("rows = %d, want 1", remaining)
	}
}

func TestMigrateRowsToDocumentsIsSafeToRunAgain(t *testing.T) {
	db := openTasksTestDB(t)
	insertTasksTestWorkspace(t, db, "workspace-1", t.TempDir())
	insertTasksTestRow(t, db, taskRow{id: "task-1", title: "Only once", status: "todo", priority: "medium"})

	repo := newTasksTestRepository(db)

	if err := MigrateRowsToDocuments(db, repo); err != nil {
		t.Fatalf("first migrate: %v", err)
	}

	first, err := repo.Get("workspace-1")
	if err != nil {
		t.Fatalf("get document: %v", err)
	}

	// Every start calls this; a second pass must not append the same task
	// again, nor fail.
	if err := MigrateRowsToDocuments(db, repo); err != nil {
		t.Fatalf("second migrate: %v", err)
	}

	second, err := repo.Get("workspace-1")
	if err != nil {
		t.Fatalf("get document again: %v", err)
	}

	if second.Content != first.Content {
		t.Fatalf("Content changed on a second run:\n%q\nvs\n%q", second.Content, first.Content)
	}
}

type taskRow struct {
	id       string
	parentID string
	title    string
	status   string
	priority string
	dueDate  string
}

func insertTasksTestRow(t *testing.T, db *sql.DB, item taskRow) {
	t.Helper()

	var parentID any
	if item.parentID != "" {
		parentID = item.parentID
	}

	var dueDate any
	if item.dueDate != "" {
		dueDate = item.dueDate
	}

	if _, err := db.Exec(`
		INSERT INTO tasks (id, workspace_id, project_id, parent_id, title, description, status, priority, due_date, created_at, updated_at, deleted_at, version, sync_status)
		VALUES (?, 'workspace-1', NULL, ?, ?, '', ?, ?, ?, ?, '2026-05-26T00:00:00Z', NULL, 1, 'local')
	`, item.id, parentID, item.title, item.status, item.priority, dueDate, "2026-05-26T00:00:0"+item.id[len(item.id)-1:]+"Z"); err != nil {
		t.Fatalf("insert task row: %v", err)
	}
}

func newTasksTestRepository(db *sql.DB) *Repository {
	return NewRepository(db, search.NewRepository(db), activities.NewRepository(db))
}

func insertTasksTestWorkspace(t *testing.T, db *sql.DB, id string, rootPath string) {
	t.Helper()

	if _, err := db.Exec(`
		INSERT INTO workspaces (id, name, description, root_path, created_at, updated_at, deleted_at, version, sync_status)
		VALUES (?, 'Personal', '', ?, '2026-05-26T00:00:00Z', '2026-05-26T00:00:00Z', NULL, 1, 'local')
	`, id, rootPath); err != nil {
		t.Fatalf("insert workspace: %v", err)
	}
}

func openTasksTestDB(t *testing.T) *sql.DB {
	t.Helper()

	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "tasks-test.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}

	t.Cleanup(func() { db.Close() })

	if _, err := db.Exec(`
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

		CREATE TABLE tasks (
			id TEXT PRIMARY KEY,
			workspace_id TEXT NOT NULL,
			project_id TEXT,
			parent_id TEXT,
			title TEXT NOT NULL,
			description TEXT NOT NULL DEFAULT '',
			status TEXT NOT NULL DEFAULT 'todo',
			priority TEXT NOT NULL DEFAULT 'medium',
			due_date TEXT,
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
			entity_type,
			entity_id,
			workspace_id,
			project_id,
			title,
			body,
			created_at,
			updated_at
		);
	`); err != nil {
		t.Fatalf("create schema: %v", err)
	}

	return db
}
