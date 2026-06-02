package tasks

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	_ "modernc.org/sqlite"

	"github.com/rinki-s/dao/apps/local-service/internal/modules/activities"
	"github.com/rinki-s/dao/apps/local-service/internal/modules/search"
)

func TestRepositoryUpdateEditsTaskAndSearchIndex(t *testing.T) {
	db := openTasksTestDB(t)
	indexer := &captureTaskIndexer{}
	repo := NewRepository(db, indexer, activities.NewRepository(db))

	insertTasksTestWorkspace(t, db, "workspace-1")
	insertTasksTestTask(t, db, Task{
		ID:          "task-1",
		WorkspaceID: "workspace-1",
		Title:       "Old title",
		Description: "Old description",
		Status:      "todo",
		Priority:    "medium",
	})

	title := "New title"
	description := "New description"
	priority := "high"
	task, err := repo.Update("task-1", UpdateTaskRequest{
		Title:       &title,
		Description: &description,
		Priority:    &priority,
	})
	if err != nil {
		t.Fatalf("update task: %v", err)
	}

	if task.Title != "New title" {
		t.Fatalf("Title = %q, want %q", task.Title, "New title")
	}
	if task.Description != "New description" {
		t.Fatalf("Description = %q, want %q", task.Description, "New description")
	}
	if task.Priority != "high" {
		t.Fatalf("Priority = %q, want %q", task.Priority, "high")
	}
	if task.Version != 2 {
		t.Fatalf("Version = %d, want 2", task.Version)
	}
	if task.SyncStatus != "local" {
		t.Fatalf("SyncStatus = %q, want local", task.SyncStatus)
	}
	if len(indexer.replacedEntries) != 1 {
		t.Fatalf("replaced entries = %d, want 1", len(indexer.replacedEntries))
	}

	entry := indexer.replacedEntries[0]
	if entry.EntityType != "task" || entry.EntityID != "task-1" {
		t.Fatalf("replace entry = %#v, want task/task-1", entry)
	}
	if entry.Title != "New title" || entry.Body != "New description" {
		t.Fatalf("replace entry content = %#v, want updated title/body", entry)
	}
}

func TestRepositoryDeleteParentSoftDeletesChildren(t *testing.T) {
	db := openTasksTestDB(t)
	indexer := &captureTaskIndexer{}
	repo := NewRepository(db, indexer, activities.NewRepository(db))

	insertTasksTestWorkspace(t, db, "workspace-1")
	insertTasksTestTask(t, db, Task{
		ID:          "parent-1",
		WorkspaceID: "workspace-1",
		Title:       "Parent",
		Status:      "doing",
		Priority:    "medium",
	})
	parentID := "parent-1"
	insertTasksTestTask(t, db, Task{
		ID:          "child-1",
		WorkspaceID: "workspace-1",
		ParentID:    &parentID,
		Title:       "Child",
		Status:      "todo",
		Priority:    "medium",
	})

	if err := repo.Delete("parent-1"); err != nil {
		t.Fatalf("delete parent task: %v", err)
	}

	var activeCount int
	if err := db.QueryRow(`
		SELECT COUNT(*)
		FROM tasks
		WHERE deleted_at IS NULL
	`).Scan(&activeCount); err != nil {
		t.Fatalf("count active tasks: %v", err)
	}
	if activeCount != 0 {
		t.Fatalf("active tasks = %d, want 0", activeCount)
	}

	if len(indexer.deletedEntries) != 2 {
		t.Fatalf("deleted search entries = %d, want 2", len(indexer.deletedEntries))
	}
	if !indexer.deletedTaskEntry("parent-1") {
		t.Fatalf("deleted search entries = %#v, want parent-1", indexer.deletedEntries)
	}
	if !indexer.deletedTaskEntry("child-1") {
		t.Fatalf("deleted search entries = %#v, want child-1", indexer.deletedEntries)
	}

	var deletedActivityCount int
	if err := db.QueryRow(`
		SELECT COUNT(*)
		FROM activities
		WHERE entity_type = 'task' AND action = 'deleted'
	`).Scan(&deletedActivityCount); err != nil {
		t.Fatalf("count delete activities: %v", err)
	}
	if deletedActivityCount != 1 {
		t.Fatalf("delete activities = %d, want 1 parent event", deletedActivityCount)
	}

	var parentDeletedActivityCount int
	if err := db.QueryRow(`
		SELECT COUNT(*)
		FROM activities
		WHERE entity_type = 'task' AND entity_id = 'parent-1' AND action = 'deleted'
	`).Scan(&parentDeletedActivityCount); err != nil {
		t.Fatalf("count parent delete activity: %v", err)
	}
	if parentDeletedActivityCount != 1 {
		t.Fatalf("parent delete activities = %d, want 1", parentDeletedActivityCount)
	}

	var childDeletedActivityCount int
	if err := db.QueryRow(`
		SELECT COUNT(*)
		FROM activities
		WHERE entity_type = 'task' AND entity_id = 'child-1' AND action = 'deleted'
	`).Scan(&childDeletedActivityCount); err != nil {
		t.Fatalf("count child delete activity: %v", err)
	}
	if childDeletedActivityCount != 0 {
		t.Fatalf("child delete activities = %d, want 0", childDeletedActivityCount)
	}
}

func TestRepositoryDeleteChildRecalculatesParentStatus(t *testing.T) {
	db := openTasksTestDB(t)
	repo := NewRepository(db, &captureTaskIndexer{}, activities.NewRepository(db))

	insertTasksTestWorkspace(t, db, "workspace-1")
	insertTasksTestTask(t, db, Task{
		ID:          "parent-1",
		WorkspaceID: "workspace-1",
		Title:       "Parent",
		Status:      "doing",
		Priority:    "medium",
	})
	parentID := "parent-1"
	insertTasksTestTask(t, db, Task{
		ID:          "child-1",
		WorkspaceID: "workspace-1",
		ParentID:    &parentID,
		Title:       "Child 1",
		Status:      "done",
		Priority:    "medium",
	})
	insertTasksTestTask(t, db, Task{
		ID:          "child-2",
		WorkspaceID: "workspace-1",
		ParentID:    &parentID,
		Title:       "Child 2",
		Status:      "todo",
		Priority:    "medium",
	})

	if err := repo.Delete("child-1"); err != nil {
		t.Fatalf("delete child task: %v", err)
	}

	var parentStatus string
	if err := db.QueryRow(`
		SELECT status
		FROM tasks
		WHERE id = ?
	`, "parent-1").Scan(&parentStatus); err != nil {
		t.Fatalf("select parent status: %v", err)
	}
	if parentStatus != "todo" {
		t.Fatalf("parent status = %q, want todo", parentStatus)
	}
}

func TestHandlerDeleteTaskReturnsNoContent(t *testing.T) {
	db := openTasksTestDB(t)
	repo := NewRepository(db, &captureTaskIndexer{}, activities.NewRepository(db))

	insertTasksTestWorkspace(t, db, "workspace-1")
	insertTasksTestTask(t, db, Task{
		ID:          "task-1",
		WorkspaceID: "workspace-1",
		Title:       "Task",
		Status:      "todo",
		Priority:    "medium",
	})

	mux := http.NewServeMux()
	NewHandler(repo).RegisterRoutes(mux)

	req := httptest.NewRequest(http.MethodDelete, "/api/tasks/task-1", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d; body = %s", rec.Code, http.StatusNoContent, rec.Body.String())
	}
	if body := rec.Body.String(); body != "" {
		t.Fatalf("body = %q, want empty", body)
	}
}

func TestHandlerDeleteTaskNotFound(t *testing.T) {
	db := openTasksTestDB(t)
	repo := NewRepository(db, &captureTaskIndexer{}, activities.NewRepository(db))

	mux := http.NewServeMux()
	NewHandler(repo).RegisterRoutes(mux)

	req := httptest.NewRequest(http.MethodDelete, "/api/tasks/missing-task", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d; body = %s", rec.Code, http.StatusNotFound, rec.Body.String())
	}
	if body := rec.Body.String(); !strings.Contains(body, "task not found") {
		t.Fatalf("body = %q, want task not found", body)
	}
}

func TestHandlerDeleteTaskInternalErrorUsesGenericResponse(t *testing.T) {
	db := openTasksTestDB(t)
	repo := NewRepository(db, &captureTaskIndexer{}, activities.NewRepository(db))

	mux := http.NewServeMux()
	NewHandler(repo).RegisterRoutes(mux)

	if err := db.Close(); err != nil {
		t.Fatalf("close db: %v", err)
	}

	req := httptest.NewRequest(http.MethodDelete, "/api/tasks/task-1", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want %d; body = %s", rec.Code, http.StatusInternalServerError, rec.Body.String())
	}

	body := rec.Body.String()
	if !strings.Contains(body, "failed to delete task") {
		t.Fatalf("body = %q, want generic delete error", body)
	}
	if strings.Contains(body, "database is closed") {
		t.Fatalf("body = %q, should not leak internal database error", body)
	}
}

func TestHandlerUpdateTaskReturnsUpdatedTask(t *testing.T) {
	db := openTasksTestDB(t)
	repo := NewRepository(db, &captureTaskIndexer{}, activities.NewRepository(db))

	insertTasksTestWorkspace(t, db, "workspace-1")
	insertTasksTestTask(t, db, Task{
		ID:          "task-1",
		WorkspaceID: "workspace-1",
		Title:       "Old task",
		Description: "Old description",
		Status:      "todo",
		Priority:    "medium",
	})

	mux := http.NewServeMux()
	NewHandler(repo).RegisterRoutes(mux)

	req := httptest.NewRequest(
		http.MethodPatch,
		"/api/tasks/task-1",
		strings.NewReader(`{"title":" Updated task ","description":" Updated description ","priority":"high"}`),
	)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body = %s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var task Task
	if err := json.NewDecoder(rec.Body).Decode(&task); err != nil {
		t.Fatalf("decode task: %v", err)
	}
	if task.Title != "Updated task" {
		t.Fatalf("title = %q, want Updated task", task.Title)
	}
	if task.Description != "Updated description" {
		t.Fatalf("description = %q, want Updated description", task.Description)
	}
	if task.Priority != "high" {
		t.Fatalf("priority = %q, want high", task.Priority)
	}
}

func TestHandlerUpdateTaskRejectsEmptyPayload(t *testing.T) {
	db := openTasksTestDB(t)
	repo := NewRepository(db, &captureTaskIndexer{}, activities.NewRepository(db))

	mux := http.NewServeMux()
	NewHandler(repo).RegisterRoutes(mux)

	req := httptest.NewRequest(http.MethodPatch, "/api/tasks/task-1", strings.NewReader(`{}`))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d; body = %s", rec.Code, http.StatusBadRequest, rec.Body.String())
	}
	if body := rec.Body.String(); !strings.Contains(body, "task update payload is required") {
		t.Fatalf("body = %q, want task update payload is required", body)
	}
}

func TestHandlerUpdateTaskNotFound(t *testing.T) {
	db := openTasksTestDB(t)
	repo := NewRepository(db, &captureTaskIndexer{}, activities.NewRepository(db))

	mux := http.NewServeMux()
	NewHandler(repo).RegisterRoutes(mux)

	req := httptest.NewRequest(
		http.MethodPatch,
		"/api/tasks/missing-task",
		strings.NewReader(`{"title":"Updated task"}`),
	)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d; body = %s", rec.Code, http.StatusNotFound, rec.Body.String())
	}
	if body := rec.Body.String(); !strings.Contains(body, "task not found") {
		t.Fatalf("body = %q, want task not found", body)
	}
}

func TestHandlerUpdateTaskStatusReturnsUpdatedTask(t *testing.T) {
	db := openTasksTestDB(t)
	repo := NewRepository(db, &captureTaskIndexer{}, activities.NewRepository(db))

	insertTasksTestWorkspace(t, db, "workspace-1")
	insertTasksTestTask(t, db, Task{
		ID:          "task-1",
		WorkspaceID: "workspace-1",
		Title:       "Task",
		Status:      "todo",
		Priority:    "medium",
	})

	mux := http.NewServeMux()
	NewHandler(repo).RegisterRoutes(mux)

	req := httptest.NewRequest(
		http.MethodPatch,
		"/api/tasks/task-1/status",
		strings.NewReader(`{"status":"done"}`),
	)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body = %s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var task Task
	if err := json.NewDecoder(rec.Body).Decode(&task); err != nil {
		t.Fatalf("decode task: %v", err)
	}
	if task.Status != "done" {
		t.Fatalf("status = %q, want done", task.Status)
	}
}

func TestHandlerUpdateTaskStatusRejectsInvalidStatus(t *testing.T) {
	db := openTasksTestDB(t)
	repo := NewRepository(db, &captureTaskIndexer{}, activities.NewRepository(db))

	mux := http.NewServeMux()
	NewHandler(repo).RegisterRoutes(mux)

	req := httptest.NewRequest(
		http.MethodPatch,
		"/api/tasks/task-1/status",
		strings.NewReader(`{"status":"doing"}`),
	)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d; body = %s", rec.Code, http.StatusBadRequest, rec.Body.String())
	}
	if body := rec.Body.String(); !strings.Contains(body, "task status is invalid") {
		t.Fatalf("body = %q, want task status is invalid", body)
	}
}

func TestHandlerUpdateTaskStatusNotFound(t *testing.T) {
	db := openTasksTestDB(t)
	repo := NewRepository(db, &captureTaskIndexer{}, activities.NewRepository(db))

	mux := http.NewServeMux()
	NewHandler(repo).RegisterRoutes(mux)

	req := httptest.NewRequest(
		http.MethodPatch,
		"/api/tasks/missing-task/status",
		strings.NewReader(`{"status":"done"}`),
	)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d; body = %s", rec.Code, http.StatusNotFound, rec.Body.String())
	}
	if body := rec.Body.String(); !strings.Contains(body, "task not found") {
		t.Fatalf("body = %q, want task not found", body)
	}
}

func TestHandlerCreateTaskReturnsCreatedTask(t *testing.T) {
	db := openTasksTestDB(t)
	repo := NewRepository(db, &captureTaskIndexer{}, activities.NewRepository(db))

	insertTasksTestWorkspace(t, db, "workspace-1")

	mux := http.NewServeMux()
	NewHandler(repo).RegisterRoutes(mux)

	req := httptest.NewRequest(
		http.MethodPost,
		"/api/tasks",
		strings.NewReader(`{"workspaceId":" workspace-1 ","title":" New task ","description":" New description ","priority":"high"}`),
	)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want %d; body = %s", rec.Code, http.StatusCreated, rec.Body.String())
	}

	var task Task
	if err := json.NewDecoder(rec.Body).Decode(&task); err != nil {
		t.Fatalf("decode task: %v", err)
	}
	if task.WorkspaceID != "workspace-1" {
		t.Fatalf("workspace ID = %q, want workspace-1", task.WorkspaceID)
	}
	if task.Title != "New task" {
		t.Fatalf("title = %q, want New task", task.Title)
	}
	if task.Description != "New description" {
		t.Fatalf("description = %q, want New description", task.Description)
	}
	if task.Priority != "high" {
		t.Fatalf("priority = %q, want high", task.Priority)
	}
}

func TestHandlerCreateTaskRequiresWorkspaceID(t *testing.T) {
	db := openTasksTestDB(t)
	repo := NewRepository(db, &captureTaskIndexer{}, activities.NewRepository(db))

	mux := http.NewServeMux()
	NewHandler(repo).RegisterRoutes(mux)

	req := httptest.NewRequest(
		http.MethodPost,
		"/api/tasks",
		strings.NewReader(`{"title":"Task","priority":"medium"}`),
	)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d; body = %s", rec.Code, http.StatusBadRequest, rec.Body.String())
	}
	if body := rec.Body.String(); !strings.Contains(body, "workspaceId is required") {
		t.Fatalf("body = %q, want workspaceId is required", body)
	}
}

func TestHandlerCreateTaskRequiresTitle(t *testing.T) {
	db := openTasksTestDB(t)
	repo := NewRepository(db, &captureTaskIndexer{}, activities.NewRepository(db))

	mux := http.NewServeMux()
	NewHandler(repo).RegisterRoutes(mux)

	req := httptest.NewRequest(
		http.MethodPost,
		"/api/tasks",
		strings.NewReader(`{"workspaceId":"workspace-1","title":"   ","priority":"medium"}`),
	)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d; body = %s", rec.Code, http.StatusBadRequest, rec.Body.String())
	}
	if body := rec.Body.String(); !strings.Contains(body, "task title is required") {
		t.Fatalf("body = %q, want task title is required", body)
	}
}

func TestHandlerCreateTaskRejectsInvalidPriority(t *testing.T) {
	db := openTasksTestDB(t)
	repo := NewRepository(db, &captureTaskIndexer{}, activities.NewRepository(db))

	mux := http.NewServeMux()
	NewHandler(repo).RegisterRoutes(mux)

	req := httptest.NewRequest(
		http.MethodPost,
		"/api/tasks",
		strings.NewReader(`{"workspaceId":"workspace-1","title":"Task","priority":"urgent"}`),
	)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d; body = %s", rec.Code, http.StatusBadRequest, rec.Body.String())
	}
	if body := rec.Body.String(); !strings.Contains(body, "task priority is invalid") {
		t.Fatalf("body = %q, want task priority is invalid", body)
	}
}

func TestHandlerCreateTaskRejectsInvalidParentTask(t *testing.T) {
	db := openTasksTestDB(t)
	repo := NewRepository(db, &captureTaskIndexer{}, activities.NewRepository(db))

	insertTasksTestWorkspace(t, db, "workspace-1")

	mux := http.NewServeMux()
	NewHandler(repo).RegisterRoutes(mux)

	req := httptest.NewRequest(
		http.MethodPost,
		"/api/tasks",
		strings.NewReader(`{"workspaceId":"workspace-1","parentId":"missing-parent","title":"Child","priority":"medium"}`),
	)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d; body = %s", rec.Code, http.StatusBadRequest, rec.Body.String())
	}
	if body := rec.Body.String(); !strings.Contains(body, "parent task is invalid") {
		t.Fatalf("body = %q, want parent task is invalid", body)
	}
}

func TestHandlerListTasksReturnsTasks(t *testing.T) {
	db := openTasksTestDB(t)
	repo := NewRepository(db, &captureTaskIndexer{}, activities.NewRepository(db))

	insertTasksTestWorkspace(t, db, "workspace-1")
	insertTasksTestTask(t, db, Task{
		ID:          "task-1",
		WorkspaceID: "workspace-1",
		Title:       "First task",
		Status:      "todo",
		Priority:    "medium",
		CreatedAt:   "2026-05-26T00:00:00Z",
		UpdatedAt:   "2026-05-26T00:00:00Z",
	})
	insertTasksTestTask(t, db, Task{
		ID:          "task-2",
		WorkspaceID: "workspace-1",
		Title:       "Second task",
		Status:      "done",
		Priority:    "high",
		CreatedAt:   "2026-05-27T00:00:00Z",
		UpdatedAt:   "2026-05-27T00:00:00Z",
	})

	mux := http.NewServeMux()
	NewHandler(repo).RegisterRoutes(mux)

	req := httptest.NewRequest(http.MethodGet, "/api/tasks", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body = %s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var tasks []Task
	if err := json.NewDecoder(rec.Body).Decode(&tasks); err != nil {
		t.Fatalf("decode tasks: %v", err)
	}
	if len(tasks) != 2 {
		t.Fatalf("tasks = %d, want 2", len(tasks))
	}
	if tasks[0].ID != "task-2" || tasks[1].ID != "task-1" {
		t.Fatalf("task order = [%s, %s], want [task-2, task-1]", tasks[0].ID, tasks[1].ID)
	}
}

func TestHandlerListTasksInternalErrorUsesGenericResponse(t *testing.T) {
	db := openTasksTestDB(t)
	repo := NewRepository(db, &captureTaskIndexer{}, activities.NewRepository(db))

	mux := http.NewServeMux()
	NewHandler(repo).RegisterRoutes(mux)

	if err := db.Close(); err != nil {
		t.Fatalf("close db: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/tasks", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want %d; body = %s", rec.Code, http.StatusInternalServerError, rec.Body.String())
	}

	body := rec.Body.String()
	if !strings.Contains(body, "failed to list tasks") {
		t.Fatalf("body = %q, want generic list error", body)
	}
	if strings.Contains(body, "database is closed") {
		t.Fatalf("body = %q, should not leak internal database error", body)
	}
}

type deletedSearchEntry struct {
	entityType string
	entityID   string
}

type captureTaskIndexer struct {
	entries         []search.IndexEntry
	replacedEntries []search.IndexEntry
	deletedEntries  []deletedSearchEntry
}

func (i *captureTaskIndexer) IndexTx(_ *sql.Tx, entry search.IndexEntry) error {
	i.entries = append(i.entries, entry)
	return nil
}

func (i *captureTaskIndexer) ReplaceTx(_ *sql.Tx, entry search.IndexEntry) error {
	i.replacedEntries = append(i.replacedEntries, entry)
	return nil
}

func (i *captureTaskIndexer) DeleteTx(_ *sql.Tx, entityType string, entityID string) error {
	i.deletedEntries = append(i.deletedEntries, deletedSearchEntry{
		entityType: entityType,
		entityID:   entityID,
	})
	return nil
}

func (i *captureTaskIndexer) deletedTaskEntry(entityID string) bool {
	for _, entry := range i.deletedEntries {
		if entry.entityType == "task" && entry.entityID == entityID {
			return true
		}
	}

	return false
}

func openTasksTestDB(t *testing.T) *sql.DB {
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
	`)
	if err != nil {
		t.Fatalf("create test schema: %v", err)
	}

	return db
}

func insertTasksTestWorkspace(t *testing.T, db *sql.DB, id string) {
	t.Helper()

	_, err := db.Exec(`
		INSERT INTO workspaces (
			id, name, description, root_path, created_at, updated_at, deleted_at, version, sync_status
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, id, "Workspace", "", "", "2026-05-26T00:00:00Z", "2026-05-26T00:00:00Z", nil, 1, "local")
	if err != nil {
		t.Fatalf("insert workspace: %v", err)
	}
}

func insertTasksTestTask(t *testing.T, db *sql.DB, task Task) {
	t.Helper()

	if task.Description == "" {
		task.Description = ""
	}
	if task.Priority == "" {
		task.Priority = "medium"
	}
	if task.Status == "" {
		task.Status = "todo"
	}
	if task.CreatedAt == "" {
		task.CreatedAt = "2026-05-26T00:00:00Z"
	}
	if task.UpdatedAt == "" {
		task.UpdatedAt = "2026-05-26T00:00:00Z"
	}
	if task.Version == 0 {
		task.Version = 1
	}
	if task.SyncStatus == "" {
		task.SyncStatus = "local"
	}

	_, err := db.Exec(`
		INSERT INTO tasks (
			id, workspace_id, project_id, parent_id, title, description, status, priority, due_date,
			created_at, updated_at, deleted_at, version, sync_status
		)
		VALUES (
			?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
		)
	`,
		task.ID,
		task.WorkspaceID,
		task.ProjectID,
		task.ParentID,
		task.Title,
		task.Description,
		task.Status,
		task.Priority,
		task.DueDate,
		task.CreatedAt,
		task.UpdatedAt,
		task.DeletedAt,
		task.Version,
		task.SyncStatus,
	)
	if err != nil {
		t.Fatalf("insert task: %v", err)
	}
}
