# Sidebar File Tree Context Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add right-click context menus to sidebar project/note rows with open, create, rename, and soft-delete actions, including optional project-note deletion.

**Architecture:** Keep UI interaction state in `ProjectTree.jsx`, but keep rename/delete business rules in the Go local service. Add missing project update/delete and note delete APIs, then wire frontend API clients and dialogs to those endpoints. Mutations refresh tree data and notify activity/search through existing repository paths.

**Tech Stack:** React JavaScript, HeroUI, Go `net/http`, SQLite, Vitest, Go test.

---

## File Structure

- Modify: `apps/local-service/internal/modules/projects/model.go`
  - Add project update/delete request shapes.
- Modify: `apps/local-service/internal/modules/projects/handler.go`
  - Add `PATCH /api/projects/{id}` and `DELETE /api/projects/{id}`.
- Modify: `apps/local-service/internal/modules/projects/repository.go`
  - Add project update and soft-delete behavior.
  - Project delete supports `deleteNotes` option; if false, unassign notes.
- Create or modify: `apps/local-service/internal/modules/projects/repository_test.go`
  - Add repository and handler tests for update/delete behavior.
- Modify: `apps/local-service/internal/modules/notes/handler.go`
  - Add `DELETE /api/notes/{id}`.
- Modify: `apps/local-service/internal/modules/notes/repository.go`
  - Add note soft-delete behavior and search index cleanup.
- Modify: `apps/local-service/internal/modules/notes/repository_test.go`
  - Add repository and handler delete tests.
- Modify: `apps/web/src/features/projects/schemas.js`
  - Add project update/delete request schemas if missing.
- Modify: `apps/web/src/features/projects/api.js`
  - Add `updateProject` and `deleteProject`.
- Modify: `apps/web/src/features/notes/api.js`
  - Add `deleteNote`.
- Modify: `apps/web/src/components/app/ProjectTree.jsx`
  - Add context menu state, right-click handlers, rename/delete dialogs, and action handlers.
- Modify: `apps/web/src/components/app/ProjectTree.test.js` and/or `ProjectTree.interactions.test.jsx`
  - Add tests for context menu actions and frontend callbacks/API calls.

## Task 1: Add Note Delete API

**Files:**
- Modify: `apps/local-service/internal/modules/notes/model.go`
- Modify: `apps/local-service/internal/modules/notes/handler.go`
- Modify: `apps/local-service/internal/modules/notes/repository.go`
- Modify: `apps/local-service/internal/modules/notes/repository_test.go`
- Modify: `apps/web/src/features/notes/api.js`

- [ ] **Step 1: Add failing Go repository test for note soft delete**

In `apps/local-service/internal/modules/notes/repository_test.go`, add:

```go
func TestRepositoryDeleteSoftDeletesNoteAndRemovesSearchIndex(t *testing.T) {
	db := openNotesTestDB(t)
	workspaceRoot := t.TempDir()

	insertNotesTestWorkspace(t, db, "workspace-1", workspaceRoot)

	indexer := &captureIndexer{}
	repo := NewRepository(db, indexer, activities.NewRepository(db))

	createdNote, err := repo.Create(CreateNoteRequest{
		WorkspaceID: "workspace-1",
		ProjectID:   nil,
		Title:       "Delete Me",
		Content:     "Temporary content",
		ContentType: "markdown",
		NoteType:    "general",
	})
	if err != nil {
		t.Fatalf("create note: %v", err)
	}

	if err := repo.Delete(createdNote.ID); err != nil {
		t.Fatalf("delete note: %v", err)
	}

	if _, err := repo.Get(createdNote.ID); err != sql.ErrNoRows {
		t.Fatalf("Get deleted note error = %v, want sql.ErrNoRows", err)
	}

	notes, err := repo.List()
	if err != nil {
		t.Fatalf("list notes: %v", err)
	}
	if len(notes) != 0 {
		t.Fatalf("len(notes) = %d, want 0", len(notes))
	}

	var deletedAt *string
	if err := db.QueryRow(`SELECT deleted_at FROM notes WHERE id = ?`, createdNote.ID).Scan(&deletedAt); err != nil {
		t.Fatalf("query deleted_at: %v", err)
	}
	if deletedAt == nil || *deletedAt == "" {
		t.Fatal("deleted_at was not set")
	}

	var searchCount int
	if err := db.QueryRow(`SELECT COUNT(*) FROM search_index WHERE entity_type = 'note' AND entity_id = ?`, createdNote.ID).Scan(&searchCount); err != nil {
		t.Fatalf("query search index: %v", err)
	}
	if searchCount != 0 {
		t.Fatalf("search index rows = %d, want 0", searchCount)
	}
}
```

- [ ] **Step 2: Add failing Go handler test for DELETE note**

In `apps/local-service/internal/modules/notes/repository_test.go`, add:

```go
func TestHandlerDeleteNote(t *testing.T) {
	db := openNotesTestDB(t)
	workspaceRoot := t.TempDir()

	insertNotesTestWorkspace(t, db, "workspace-1", workspaceRoot)

	repo := NewRepository(db, &captureIndexer{}, activities.NewRepository(db))
	createdNote, err := repo.Create(CreateNoteRequest{
		WorkspaceID: "workspace-1",
		ProjectID:   nil,
		Title:       "Handler Delete",
		Content:     "Delete via handler",
		ContentType: "markdown",
		NoteType:    "general",
	})
	if err != nil {
		t.Fatalf("create note: %v", err)
	}

	mux := http.NewServeMux()
	NewHandler(repo).RegisterRoutes(mux)

	req := httptest.NewRequest(http.MethodDelete, "/api/notes/"+createdNote.ID, nil)
	rec := httptest.NewRecorder()

	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d; body = %s", rec.Code, http.StatusNoContent, rec.Body.String())
	}

	if _, err := repo.Get(createdNote.ID); err != sql.ErrNoRows {
		t.Fatalf("Get deleted note error = %v, want sql.ErrNoRows", err)
	}
}
```

- [ ] **Step 3: Run notes tests and verify failure**

Run:

```bash
cd apps/local-service
go test ./internal/modules/notes
```

Expected: FAIL because `Repository.Delete` and handler route do not exist.

- [ ] **Step 4: Implement note repository delete**

In `apps/local-service/internal/modules/notes/repository.go`, add before `noteParentDir`:

```go
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
```

- [ ] **Step 5: Implement DELETE note handler**

In `apps/local-service/internal/modules/notes/handler.go`, add route:

```go
mux.HandleFunc("DELETE /api/notes/{id}", h.delete)
```

Add handler method after `update`:

```go
func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		httpx.Error(w, http.StatusBadRequest, "note id is required")
		return
	}

	if err := h.repo.Delete(id); err != nil {
		if err == sql.ErrNoRows {
			httpx.Error(w, http.StatusNotFound, "note not found")
			return
		}

		httpx.Error(w, http.StatusInternalServerError, "failed to delete note")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
```

- [ ] **Step 6: Add frontend note delete API**

In `apps/web/src/features/notes/api.js`, add:

```js
export async function deleteNote(id) {
  const response = await apiFetch(`/api/notes/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error(`Failed to delete note: ${response.status}`);
  }
}
```

- [ ] **Step 7: Run tests**

Run:

```bash
cd apps/local-service
go test ./internal/modules/notes
cd ../web
npm test -- notes/api
```

Expected: PASS. If no notes API test covers delete yet, add one mirroring task API delete tests and rerun.

- [ ] **Step 8: Commit note delete API**

Run:

```bash
git add apps/local-service/internal/modules/notes apps/web/src/features/notes/api.js apps/web/src/features/notes/api.test.js
git commit -m "feat: add note delete api"
```

## Task 2: Add Project Update and Delete API

**Files:**
- Modify: `apps/local-service/internal/modules/projects/model.go`
- Modify: `apps/local-service/internal/modules/projects/handler.go`
- Modify: `apps/local-service/internal/modules/projects/repository.go`
- Create: `apps/local-service/internal/modules/projects/repository_test.go`
- Modify: `apps/web/src/features/projects/schemas.js`
- Modify: `apps/web/src/features/projects/api.js`
- Modify: `apps/web/src/features/projects/api.test.js`

- [ ] **Step 1: Add project repository tests**

Create `apps/local-service/internal/modules/projects/repository_test.go` with tests for update, delete while keeping notes, and delete while deleting notes. Reuse the notes test style: open an in-memory SQLite DB with `projects`, `workspaces`, `notes`, `search_index`, and `activities` tables matching the migration columns used by repositories.

The tests must assert:

```go
func TestRepositoryUpdateRenamesProjectAndReplacesSearchIndex(t *testing.T)
func TestRepositoryDeleteKeepsNotesByUnassigningThem(t *testing.T)
func TestRepositoryDeleteCanDeleteProjectNotes(t *testing.T)
func TestHandlerUpdateProject(t *testing.T)
func TestHandlerDeleteProjectWithDeleteNotesOption(t *testing.T)
```

Expected behaviors:

- Update trims and persists name/description, increments version, sets sync_status `local`, replaces project search row.
- Delete with `DeleteNotes: false` sets project `deleted_at`, removes project search row, sets matching notes `project_id = NULL`, keeps note `deleted_at NULL`, and updates note search rows to `project_id NULL` by replacing them or updating search rows.
- Delete with `DeleteNotes: true` sets project `deleted_at`, soft deletes matching notes, removes project search row, and removes deleted note search rows.
- Handler update returns `200` with updated project JSON.
- Handler delete accepts JSON body `{ "deleteNotes": true }` and returns `204`.

- [ ] **Step 2: Run project tests and verify failure**

Run:

```bash
cd apps/local-service
go test ./internal/modules/projects
```

Expected: FAIL because update/delete APIs do not exist.

- [ ] **Step 3: Add project request models**

In `apps/local-service/internal/modules/projects/model.go`, add:

```go
type UpdateProjectRequest struct {
	Name        *string `json:"name"`
	Description *string `json:"description"`
}

type DeleteProjectRequest struct {
	DeleteNotes bool `json:"deleteNotes"`
}
```

- [ ] **Step 4: Implement project repository update**

In `apps/local-service/internal/modules/projects/repository.go`, add method:

```go
func (r *Repository) Update(id string, req UpdateProjectRequest) (Project, error) {
	now := time.Now().UTC().Format(time.RFC3339)

	project, err := scanProject(r.db.QueryRow(`
		SELECT id, workspace_id, name, description, folder_path, status, started_at, ended_at, created_at, updated_at, deleted_at, version, sync_status
		FROM projects
		WHERE id = ? AND deleted_at IS NULL
	`, id))
	if err != nil {
		return Project{}, err
	}

	if req.Name != nil {
		project.Name = *req.Name
	}
	if req.Description != nil {
		project.Description = *req.Description
	}

	tx, err := r.db.Begin()
	if err != nil {
		return Project{}, err
	}
	defer tx.Rollback()

	result, err := tx.Exec(`
		UPDATE projects
		SET name = ?, description = ?, updated_at = ?, version = version + 1, sync_status = 'local'
		WHERE id = ? AND deleted_at IS NULL
	`, project.Name, project.Description, now, id)
	if err != nil {
		return Project{}, err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return Project{}, err
	}
	if rowsAffected == 0 {
		return Project{}, sql.ErrNoRows
	}

	project.UpdatedAt = now
	project.Version += 1
	project.SyncStatus = "local"

	projectID := project.ID
	if err := r.indexer.ReplaceTx(tx, search.IndexEntry{
		EntityType:  "project",
		EntityID:    project.ID,
		WorkspaceID: project.WorkspaceID,
		ProjectID:   &projectID,
		Title:       project.Name,
		Body:        project.Description,
		CreatedAt:   project.CreatedAt,
		UpdatedAt:   project.UpdatedAt,
	}); err != nil {
		return Project{}, err
	}

	if err := tx.Commit(); err != nil {
		return Project{}, err
	}

	return project, nil
}
```

If `scanProject` does not exist, extract one from `List` scanning logic and reuse it.

- [ ] **Step 5: Implement project repository delete**

In `apps/local-service/internal/modules/projects/repository.go`, add method:

```go
func (r *Repository) Delete(id string, req DeleteProjectRequest) error {
	now := time.Now().UTC().Format(time.RFC3339)

	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	result, err := tx.Exec(`
		UPDATE projects
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

	if req.DeleteNotes {
		if _, err := tx.Exec(`
			UPDATE notes
			SET deleted_at = ?, updated_at = ?, version = version + 1, sync_status = 'local'
			WHERE project_id = ? AND deleted_at IS NULL
		`, now, now, id); err != nil {
			return err
		}
		if _, err := tx.Exec(`
			DELETE FROM search_index
			WHERE entity_type = 'note' AND project_id = ?
		`, id); err != nil {
			return err
		}
	} else {
		if _, err := tx.Exec(`
			UPDATE notes
			SET project_id = NULL, updated_at = ?, version = version + 1, sync_status = 'local'
			WHERE project_id = ? AND deleted_at IS NULL
		`, now, id); err != nil {
			return err
		}
		if _, err := tx.Exec(`
			UPDATE search_index
			SET project_id = NULL
			WHERE entity_type = 'note' AND project_id = ?
		`, id); err != nil {
			return err
		}
	}

	if err := r.indexer.DeleteTx(tx, "project", id); err != nil {
		return err
	}

	return tx.Commit()
}
```

- [ ] **Step 6: Implement project handlers**

In `apps/local-service/internal/modules/projects/handler.go`, add routes:

```go
mux.HandleFunc("PATCH /api/projects/{id}", h.update)
mux.HandleFunc("DELETE /api/projects/{id}", h.delete)
```

Add update/delete methods with validation:

```go
func (h *Handler) update(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		httpx.Error(w, http.StatusBadRequest, "project id is required")
		return
	}

	var req UpdateProjectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Name != nil {
		name := strings.TrimSpace(*req.Name)
		if name == "" {
			httpx.Error(w, http.StatusBadRequest, "project name is required")
			return
		}
		req.Name = &name
	}
	if req.Description != nil {
		description := strings.TrimSpace(*req.Description)
		req.Description = &description
	}
	if req.Name == nil && req.Description == nil {
		httpx.Error(w, http.StatusBadRequest, "project update payload is required")
		return
	}

	project, err := h.repo.Update(id, req)
	if err != nil {
		if err == sql.ErrNoRows {
			httpx.Error(w, http.StatusNotFound, "project not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to update project")
		return
	}

	httpx.JSON(w, http.StatusOK, project)
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		httpx.Error(w, http.StatusBadRequest, "project id is required")
		return
	}

	var req DeleteProjectRequest
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}

	if err := h.repo.Delete(id, req); err != nil {
		if err == sql.ErrNoRows {
			httpx.Error(w, http.StatusNotFound, "project not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to delete project")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
```

Add `database/sql` import if needed.

- [ ] **Step 7: Add frontend project API functions and tests**

In `apps/web/src/features/projects/schemas.js`, add Zod schemas for update/delete inputs following existing style.

In `apps/web/src/features/projects/api.js`, add:

```js
export async function updateProject(id, input) {
  const payload = UpdateProjectInputSchema.parse(input);
  const response = await apiFetch(`/api/projects/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Failed to update project: ${response.status}`);
  }
  const data = await response.json();
  return ProjectSchema.parse(data);
}

export async function deleteProject(id, input = { deleteNotes: false }) {
  const payload = DeleteProjectInputSchema.parse(input);
  const response = await apiFetch(`/api/projects/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Failed to delete project: ${response.status}`);
  }
}
```

Add API tests mirroring task API tests for PATCH and DELETE.

- [ ] **Step 8: Run tests**

Run:

```bash
cd apps/local-service
go test ./internal/modules/projects
cd ../web
npm test -- projects/api
```

Expected: PASS.

- [ ] **Step 9: Commit project mutation API**

Run:

```bash
git add apps/local-service/internal/modules/projects apps/web/src/features/projects
git commit -m "feat: add project rename and delete api"
```

## Task 3: Add ProjectTree Context Menu UI

**Files:**
- Modify: `apps/web/src/components/app/ProjectTree.jsx`
- Modify: `apps/web/src/components/app/ProjectTree.interactions.test.jsx`

- [ ] **Step 1: Add failing ProjectTree context menu tests**

Add tests that mock project/note APIs and verify:

- Right-clicking a project row opens menu with `Open`, `New note`, `Rename`, `Delete`.
- Choosing `Open` calls `onSelectProject(project)`.
- Choosing `New note` opens the existing content dialog with the project preselected.
- Choosing `Rename` opens a rename dialog with the current project name and calls `updateProject` on submit.
- Choosing `Delete` opens a confirmation dialog with checkbox `Also delete notes in this project`; submitting calls `deleteProject(project.id, { deleteNotes: checkboxValue })`.
- Right-clicking a note row opens menu with `Open`, `Rename`, `Delete`.
- Note rename calls `updateNote(note.id, { title })`.
- Note delete calls `deleteNote(note.id)`.

Use Testing Library `fireEvent.contextMenu` or `user.pointer` depending on existing test style.

- [ ] **Step 2: Run ProjectTree tests and verify failure**

Run:

```bash
cd apps/web
npm test -- ProjectTree
```

Expected: FAIL because context menu UI does not exist.

- [ ] **Step 3: Import mutation APIs**

In `apps/web/src/components/app/ProjectTree.jsx`, update imports:

```js
import { deleteNote, updateNote, createNote, listNotes } from '@/features/notes/api.js';
import { createProject, deleteProject, listProjects, updateProject } from '@/features/projects/api.js';
```

Keep import ordering consistent with existing file style.

- [ ] **Step 4: Add context menu and dialog state**

Add state inside `ProjectTree`:

```js
const [treeContextMenu, setTreeContextMenu] = useState(null);
const [renameTarget, setRenameTarget] = useState(null);
const [renameValue, setRenameValue] = useState('');
const [deleteTarget, setDeleteTarget] = useState(null);
const [deleteProjectNotes, setDeleteProjectNotes] = useState(false);
const [treeActionError, setTreeActionError] = useState('');
const [isTreeActionPending, setIsTreeActionPending] = useState(false);
```

`treeContextMenu` shape:

```js
{
  x: number,
  y: number,
  type: 'project' | 'note',
  item: projectOrNote,
}
```

- [ ] **Step 5: Add context menu handlers**

Add functions:

```js
function openTreeContextMenu(event, type, item) {
  event.preventDefault();
  setTreeActionError('');
  setTreeContextMenu({ x: event.clientX, y: event.clientY, type, item });
}

function closeTreeContextMenu() {
  setTreeContextMenu(null);
}

function openRenameDialog(type, item) {
  closeTreeContextMenu();
  setRenameTarget({ type, item });
  setRenameValue(type === 'project' ? item.name : item.title);
  setTreeActionError('');
}

function openDeleteDialog(type, item) {
  closeTreeContextMenu();
  setDeleteTarget({ type, item });
  setDeleteProjectNotes(false);
  setTreeActionError('');
}
```

- [ ] **Step 6: Attach right-click handlers to rows**

For project buttons, add:

```jsx
onContextMenu={(event) => openTreeContextMenu(event, 'project', project)}
```

For note buttons, add:

```jsx
onContextMenu={(event) => openTreeContextMenu(event, 'note', note)}
```

If `ProjectTreeButton` does not accept `onContextMenu`, add it as a prop and pass it to the underlying button.

- [ ] **Step 7: Render context menu popover**

Near the end of `ProjectTree` JSX, before modals, render a fixed-position HeroUI popover/dropdown using the TaskPanel pattern:

```jsx
<Dropdown isOpen={Boolean(treeContextMenu)} onOpenChange={(isOpen) => !isOpen && closeTreeContextMenu()}>
  <Dropdown.Trigger>
    <button
      aria-hidden="true"
      className="fixed size-px opacity-0"
      style={{ left: treeContextMenu?.x ?? 0, top: treeContextMenu?.y ?? 0 }}
      type="button"
    />
  </Dropdown.Trigger>
  <Dropdown.Popover
    className="w-44"
    placement="bottom start"
    style={{ left: treeContextMenu?.x ?? 0, top: treeContextMenu?.y ?? 0 }}
  >
    <Dropdown.Menu aria-label="File tree actions" onAction={handleTreeContextMenuAction}>
      <Dropdown.Item id="open">Open</Dropdown.Item>
      {treeContextMenu?.type === 'project' && <Dropdown.Item id="new-note">New note</Dropdown.Item>}
      <Dropdown.Item id="rename">Rename</Dropdown.Item>
      <Dropdown.Separator />
      <Dropdown.Item id="delete" variant="danger">Delete</Dropdown.Item>
    </Dropdown.Menu>
  </Dropdown.Popover>
</Dropdown>
```

Adjust to match actual HeroUI Dropdown API used in TaskPanel if needed.

- [ ] **Step 8: Implement context menu action handler**

Add:

```js
function handleTreeContextMenuAction(actionKey) {
  if (!treeContextMenu) return;

  const { type, item } = treeContextMenu;

  if (actionKey === 'open') {
    closeTreeContextMenu();
    if (type === 'project') onSelectProject(item);
    if (type === 'note') onSelectNote(item);
    return;
  }

  if (actionKey === 'new-note' && type === 'project') {
    closeTreeContextMenu();
    openContentDialog(item.id);
    return;
  }

  if (actionKey === 'rename') {
    openRenameDialog(type, item);
    return;
  }

  if (actionKey === 'delete') {
    openDeleteDialog(type, item);
  }
}
```

- [ ] **Step 9: Add rename dialog**

Add a HeroUI Modal with input label `Name` for projects and `Title` for notes. Submit handler:

```js
async function handleRenameSubmit(event) {
  event.preventDefault();
  if (!renameTarget) return;
  const nextValue = renameValue.trim();
  if (!nextValue) {
    setTreeActionError(renameTarget.type === 'project' ? 'Project name is required' : 'Note title is required');
    return;
  }

  try {
    setIsTreeActionPending(true);
    setTreeActionError('');
    if (renameTarget.type === 'project') {
      await updateProject(renameTarget.item.id, { name: nextValue });
    } else {
      await updateNote(renameTarget.item.id, { title: nextValue });
    }
    setRenameTarget(null);
    setRenameValue('');
    await loadTreeData();
    notifyActivityChanged();
  } catch (err) {
    setTreeActionError(err instanceof Error ? err.message : 'Failed to rename item');
  } finally {
    setIsTreeActionPending(false);
  }
}
```

- [ ] **Step 10: Add delete confirmation dialog**

Add a HeroUI Modal. For project targets, compute note count:

```js
const deleteProjectNoteCount =
  deleteTarget?.type === 'project' ? (notesByProjectId.get(deleteTarget.item.id)?.length ?? 0) : 0;
```

Project dialog text must include the note count and checkbox `Also delete notes in this project`. Submit handler:

```js
async function handleDeleteSubmit(event) {
  event.preventDefault();
  if (!deleteTarget) return;

  try {
    setIsTreeActionPending(true);
    setTreeActionError('');
    if (deleteTarget.type === 'project') {
      await deleteProject(deleteTarget.item.id, { deleteNotes: deleteProjectNotes });
    } else {
      await deleteNote(deleteTarget.item.id);
    }
    setDeleteTarget(null);
    setDeleteProjectNotes(false);
    await loadTreeData();
    notifyActivityChanged();
  } catch (err) {
    setTreeActionError(err instanceof Error ? err.message : 'Failed to delete item');
  } finally {
    setIsTreeActionPending(false);
  }
}
```

- [ ] **Step 11: Run ProjectTree tests**

Run:

```bash
cd apps/web
npm test -- ProjectTree
```

Expected: PASS.

- [ ] **Step 12: Commit context menu UI**

Run:

```bash
git add apps/web/src/components/app/ProjectTree.jsx apps/web/src/components/app/ProjectTree*.test.*
git commit -m "feat: add sidebar file tree context menu"
```

## Task 4: Final Validation

**Files:**
- Modify only if validation exposes issues.

- [ ] **Step 1: Run Go tests**

Run:

```bash
cd apps/local-service
go test ./...
go vet ./...
```

Expected: PASS.

- [ ] **Step 2: Run web focused tests**

Run:

```bash
cd apps/web
npm test -- ProjectTree App notes/api projects/api
```

Expected: PASS.

- [ ] **Step 3: Run web build**

Run:

```bash
cd apps/web
npm run build
```

Expected: PASS. Existing chunk-size warning is acceptable.

- [ ] **Step 4: Inspect git status**

Run:

```bash
git status --short
```

Expected: only `apps/web/.pi-lens/` may remain untracked. Do not add it.

- [ ] **Step 5: Commit final fixes if needed**

If validation required fixes, commit them:

```bash
git add <fixed files>
git commit -m "fix: stabilize sidebar file tree context menu"
```

If no fixes were needed, skip this commit.

## Self-Review

- Spec coverage: The plan covers project/note context menu actions, project delete with optional note deletion, note delete, project rename, note rename, React/Go boundaries, search index cleanup, activity notifications, and final validation.
- Placeholder scan: No incomplete sections remain. The project test setup requires matching current migrations; implementers must copy exact columns from existing tests/migrations instead of inventing schema.
- Type consistency: Project delete uses `{ deleteNotes: boolean }` across Go model, handler, frontend API, and UI. Project/note rename use existing title/name fields.
