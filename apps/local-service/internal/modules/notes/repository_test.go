package notes

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

	updatedNote, err := repo.UpdateContent(createdNote.ID, "Updated content", "")
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

func TestRepositoryUpdateChangesMetadataAndReplacesIndex(t *testing.T) {
	db := openNotesTestDB(t)
	workspaceRoot := t.TempDir()

	insertNotesTestWorkspace(t, db, "workspace-1", workspaceRoot)

	indexer := &captureIndexer{}
	repo := NewRepository(db, indexer, activities.NewRepository(db))

	createdNote, err := repo.Create(CreateNoteRequest{
		WorkspaceID: "workspace-1",
		ProjectID:   nil,
		Title:       "Draft Title",
		Content:     "Markdown body",
		ContentType: "markdown",
		NoteType:    "general",
	})
	if err != nil {
		t.Fatalf("create note: %v", err)
	}

	title := "Published Title"
	noteType := "learning"
	updatedNote, err := repo.Update(createdNote.ID, UpdateNoteRequest{
		Title:    &title,
		NoteType: &noteType,
	})
	if err != nil {
		t.Fatalf("update note: %v", err)
	}

	if updatedNote.Title != "Published Title" {
		t.Fatalf("Title = %q", updatedNote.Title)
	}

	if updatedNote.NoteType != "learning" {
		t.Fatalf("NoteType = %q", updatedNote.NoteType)
	}

	if updatedNote.Content != "Markdown body" {
		t.Fatalf("Content = %q", updatedNote.Content)
	}

	if updatedNote.Version != createdNote.Version+1 {
		t.Fatalf("Version = %d, want %d", updatedNote.Version, createdNote.Version+1)
	}

	assertFileContent(t, updatedNote.FilePath, "Markdown body")

	if len(indexer.replacedEntries) != 1 {
		t.Fatalf("len(indexer.replacedEntries) = %d, want 1", len(indexer.replacedEntries))
	}

	if indexer.replacedEntries[0].Title != "Published Title" {
		t.Fatalf("replaced title = %q", indexer.replacedEntries[0].Title)
	}

	if indexer.replacedEntries[0].Body != "Markdown body" {
		t.Fatalf("replaced body = %q", indexer.replacedEntries[0].Body)
	}
}

func TestRepositoryUpdateMovesMarkdownFileWhenTitleChanges(t *testing.T) {
	db := openNotesTestDB(t)
	workspaceRoot := t.TempDir()

	insertNotesTestWorkspace(t, db, "workspace-1", workspaceRoot)

	repo := NewRepository(db, &captureIndexer{}, activities.NewRepository(db))

	createdNote, err := repo.Create(CreateNoteRequest{
		WorkspaceID: "workspace-1",
		Title:       "Draft Title",
		Content:     "Markdown body",
		ContentType: "markdown",
		NoteType:    "general",
	})
	if err != nil {
		t.Fatalf("create note: %v", err)
	}

	title := "Published Title"
	updatedNote, err := repo.Update(createdNote.ID, UpdateNoteRequest{Title: &title})
	if err != nil {
		t.Fatalf("update note: %v", err)
	}

	// The title, and nothing else. The identifier used to be appended here and
	// is not any more: this folder is one a person opens in Finder.
	wantPath := filepath.Join(workspaceRoot, "published-title.md")

	if updatedNote.FilePath != wantPath {
		t.Fatalf("FilePath = %q, want %q", updatedNote.FilePath, wantPath)
	}
	if strings.Contains(filepath.Base(updatedNote.FilePath), createdNote.ID) {
		t.Errorf("the file name still carries the id: %q", filepath.Base(updatedNote.FilePath))
	}

	if _, err := os.Stat(createdNote.FilePath); !os.IsNotExist(err) {
		t.Fatalf("file left behind at %q, stat err = %v", createdNote.FilePath, err)
	}

	assertFileContent(t, updatedNote.FilePath, "Markdown body")

	// The stored path has to follow the move, or every later read opens a file
	// that is no longer there.
	var storedPath string
	if err := db.QueryRow(`SELECT file_path FROM notes WHERE id = ?`, createdNote.ID).Scan(&storedPath); err != nil {
		t.Fatalf("select file_path: %v", err)
	}

	if storedPath != wantPath {
		t.Fatalf("stored file_path = %q, want %q", storedPath, wantPath)
	}
}

func TestRepositoryUpdateMovesMarkdownFileIntoAndOutOfAFolder(t *testing.T) {
	db := openNotesTestDB(t)
	workspaceRoot := t.TempDir()
	projectRoot := filepath.Join(workspaceRoot, "dao-project-project-1")

	if err := os.MkdirAll(projectRoot, 0755); err != nil {
		t.Fatalf("create project root: %v", err)
	}

	insertNotesTestWorkspace(t, db, "workspace-1", workspaceRoot)
	insertNotesTestProject(t, db, "project-1", "workspace-1", projectRoot)

	repo := NewRepository(db, &captureIndexer{}, activities.NewRepository(db))

	createdNote, err := repo.Create(CreateNoteRequest{
		WorkspaceID: "workspace-1",
		Title:       "Loose Note",
		Content:     "Markdown body",
		ContentType: "markdown",
		NoteType:    "general",
	})
	if err != nil {
		t.Fatalf("create note: %v", err)
	}

	projectID := "project-1"
	inFolder, err := repo.Update(createdNote.ID, UpdateNoteRequest{
		ProjectID: OptionalProjectID{Set: true, Value: &projectID},
	})
	if err != nil {
		t.Fatalf("move note into folder: %v", err)
	}

	if filepath.Dir(inFolder.FilePath) != projectRoot {
		t.Fatalf("FilePath dir = %q, want %q", filepath.Dir(inFolder.FilePath), projectRoot)
	}

	if inFolder.ProjectID == nil || *inFolder.ProjectID != "project-1" {
		t.Fatalf("ProjectID = %v, want project-1", inFolder.ProjectID)
	}

	if _, err := os.Stat(createdNote.FilePath); !os.IsNotExist(err) {
		t.Fatalf("file left behind at %q, stat err = %v", createdNote.FilePath, err)
	}

	assertFileContent(t, inFolder.FilePath, "Markdown body")

	// An explicit null moves it back out — the case a plain *string could not
	// express, since an absent field arrives the same way.
	atRoot, err := repo.Update(createdNote.ID, UpdateNoteRequest{
		ProjectID: OptionalProjectID{Set: true, Value: nil},
	})
	if err != nil {
		t.Fatalf("move note to workspace root: %v", err)
	}

	if filepath.Dir(atRoot.FilePath) != workspaceRoot {
		t.Fatalf("FilePath dir = %q, want %q", filepath.Dir(atRoot.FilePath), workspaceRoot)
	}

	if atRoot.ProjectID != nil {
		t.Fatalf("ProjectID = %v, want nil", *atRoot.ProjectID)
	}

	if _, err := os.Stat(inFolder.FilePath); !os.IsNotExist(err) {
		t.Fatalf("file left behind at %q, stat err = %v", inFolder.FilePath, err)
	}

	assertFileContent(t, atRoot.FilePath, "Markdown body")
}

func TestRepositoryUpdateRejectsUnknownFolder(t *testing.T) {
	db := openNotesTestDB(t)
	workspaceRoot := t.TempDir()

	insertNotesTestWorkspace(t, db, "workspace-1", workspaceRoot)

	repo := NewRepository(db, &captureIndexer{}, activities.NewRepository(db))

	createdNote, err := repo.Create(CreateNoteRequest{
		WorkspaceID: "workspace-1",
		Title:       "Loose Note",
		Content:     "Markdown body",
		ContentType: "markdown",
		NoteType:    "general",
	})
	if err != nil {
		t.Fatalf("create note: %v", err)
	}

	missing := "project-does-not-exist"
	if _, err := repo.Update(createdNote.ID, UpdateNoteRequest{
		ProjectID: OptionalProjectID{Set: true, Value: &missing},
	}); !errors.Is(err, ErrProjectNotFound) {
		t.Fatalf("err = %v, want ErrProjectNotFound", err)
	}

	// The note must be untouched, not half-moved.
	assertFileContent(t, createdNote.FilePath, "Markdown body")
}

func TestRepositoryUpdateKeepsFilePathWhenTitleIsUnchanged(t *testing.T) {
	db := openNotesTestDB(t)
	workspaceRoot := t.TempDir()

	insertNotesTestWorkspace(t, db, "workspace-1", workspaceRoot)

	repo := NewRepository(db, &captureIndexer{}, activities.NewRepository(db))

	createdNote, err := repo.Create(CreateNoteRequest{
		WorkspaceID: "workspace-1",
		Title:       "Steady Title",
		Content:     "Markdown body",
		ContentType: "markdown",
		NoteType:    "general",
	})
	if err != nil {
		t.Fatalf("create note: %v", err)
	}

	noteType := "learning"
	updatedNote, err := repo.Update(createdNote.ID, UpdateNoteRequest{NoteType: &noteType})
	if err != nil {
		t.Fatalf("update note: %v", err)
	}

	if updatedNote.FilePath != createdNote.FilePath {
		t.Fatalf("FilePath = %q, want it unchanged at %q", updatedNote.FilePath, createdNote.FilePath)
	}

	assertFileContent(t, createdNote.FilePath, "Markdown body")
}

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

	if len(indexer.deletedEntries) != 1 {
		t.Fatalf("len(indexer.deletedEntries) = %d, want 1", len(indexer.deletedEntries))
	}
	if indexer.deletedEntries[0].entityType != "note" || indexer.deletedEntries[0].entityID != createdNote.ID {
		t.Fatalf("deleted search entry = %#v", indexer.deletedEntries[0])
	}

	// In a workspace that is a folder of Markdown files, the file is the note.
	// A row marked deleted beside a file still sitting in the folder is not a
	// deleted note; it is a hidden one.
	if _, err := os.Stat(createdNote.FilePath); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("the file is still in the workspace: Stat err = %v", err)
	}
}

// The watcher deletes a note precisely because its file is already gone, so a
// missing file is the ordinary case rather than a failure.
func TestDeletingANoteWhoseFileIsAlreadyGone(t *testing.T) {
	db := openNotesTestDB(t)
	workspaceRoot := t.TempDir()
	insertNotesTestWorkspace(t, db, "workspace-1", workspaceRoot)

	repo := NewRepository(db, &captureIndexer{}, activities.NewRepository(db))

	note, err := repo.Create(CreateNoteRequest{
		WorkspaceID: "workspace-1",
		Title:       "Gone Already",
		Content:     "x",
	})
	if err != nil {
		t.Fatalf("create note: %v", err)
	}

	if err := os.Remove(note.FilePath); err != nil {
		t.Fatalf("remove: %v", err)
	}

	if err := repo.Delete(note.ID); err != nil {
		t.Fatalf("delete note: %v", err)
	}

	notes, _ := repo.List()
	if len(notes) != 0 {
		t.Errorf("the note survived: %+v", notes)
	}
}

// The file is removed before the row is committed, so a removal that cannot
// happen takes the whole delete with it. The alternative is an app insisting a
// note is gone while its file is still in the folder — which is exactly what
// the dialog asking for this promises will not happen.
func TestANoteWhoseFileCannotBeRemovedIsNotDeleted(t *testing.T) {
	db := openNotesTestDB(t)
	workspaceRoot := t.TempDir()
	insertNotesTestWorkspace(t, db, "workspace-1", workspaceRoot)

	repo := NewRepository(db, &captureIndexer{}, activities.NewRepository(db))

	note, err := repo.Create(CreateNoteRequest{
		WorkspaceID: "workspace-1",
		Title:       "Held Open",
		Content:     "still here",
	})
	if err != nil {
		t.Fatalf("create note: %v", err)
	}

	// Unlinking needs write permission on the directory, not on the file.
	if err := os.Chmod(workspaceRoot, 0o500); err != nil {
		t.Fatalf("chmod: %v", err)
	}
	t.Cleanup(func() { _ = os.Chmod(workspaceRoot, 0o755) })

	if err := repo.Delete(note.ID); err == nil {
		t.Fatal("deleting a note whose file could not be removed reported success")
	}

	// Both halves still intact: the note is listed and the file is on disk.
	notes, _ := repo.List()
	if len(notes) != 1 {
		t.Errorf("got %d notes, want the one that could not be deleted", len(notes))
	}
	if _, err := os.Stat(note.FilePath); err != nil {
		t.Errorf("the file went anyway: Stat err = %v", err)
	}
}

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

func TestHandlerUpdateNote(t *testing.T) {
	db := openNotesTestDB(t)
	workspaceRoot := t.TempDir()

	insertNotesTestWorkspace(t, db, "workspace-1", workspaceRoot)

	repo := NewRepository(db, &captureIndexer{}, activities.NewRepository(db))
	createdNote, err := repo.Create(CreateNoteRequest{
		WorkspaceID: "workspace-1",
		ProjectID:   nil,
		Title:       "Handler Draft",
		Content:     "Handler body",
		ContentType: "markdown",
		NoteType:    "general",
	})
	if err != nil {
		t.Fatalf("create note: %v", err)
	}

	mux := http.NewServeMux()
	NewHandler(repo).RegisterRoutes(mux)

	req := httptest.NewRequest(
		http.MethodPatch,
		"/api/notes/"+createdNote.ID,
		bytes.NewBufferString(`{"title":"Handler Published","noteType":"learning"}`),
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

	if note.Title != "Handler Published" {
		t.Fatalf("Title = %q", note.Title)
	}

	if note.NoteType != "learning" {
		t.Fatalf("NoteType = %q", note.NoteType)
	}

	if note.Content != "Handler body" {
		t.Fatalf("Content = %q", note.Content)
	}
}

func TestHandlerUpdateNoteRejectsEmptyTitle(t *testing.T) {
	db := openNotesTestDB(t)
	repo := NewRepository(db, &captureIndexer{}, activities.NewRepository(db))
	mux := http.NewServeMux()
	NewHandler(repo).RegisterRoutes(mux)

	req := httptest.NewRequest(
		http.MethodPatch,
		"/api/notes/note-1",
		bytes.NewBufferString(`{"title":"   "}`),
	)
	rec := httptest.NewRecorder()

	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}
}

func TestHandlerUpdateNoteNotFound(t *testing.T) {
	db := openNotesTestDB(t)
	repo := NewRepository(db, &captureIndexer{}, activities.NewRepository(db))
	mux := http.NewServeMux()
	NewHandler(repo).RegisterRoutes(mux)

	req := httptest.NewRequest(
		http.MethodPatch,
		"/api/notes/missing-note",
		bytes.NewBufferString(`{"title":"Missing Note"}`),
	)
	rec := httptest.NewRecorder()

	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusNotFound)
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

type deletedSearchEntry struct {
	entityType string
	entityID   string
}

type captureIndexer struct {
	entries         []search.IndexEntry
	replacedEntries []search.IndexEntry
	deletedEntries  []deletedSearchEntry
}

func (i *captureIndexer) IndexTx(_ *sql.Tx, entry search.IndexEntry) error {
	i.entries = append(i.entries, entry)
	return nil
}

func (i *captureIndexer) ReplaceTx(_ *sql.Tx, entry search.IndexEntry) error {
	i.replacedEntries = append(i.replacedEntries, entry)
	return nil
}

func (i *captureIndexer) DeleteTx(_ *sql.Tx, entityType string, entityID string) error {
	i.deletedEntries = append(i.deletedEntries, deletedSearchEntry{
		entityType: entityType,
		entityID:   entityID,
	})
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
