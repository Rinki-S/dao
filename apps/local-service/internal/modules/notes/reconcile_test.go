package notes

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/rinki-s/dao/apps/local-service/internal/modules/activities"
)

// A workspace with one project folder, ready for files to appear in it.
func reconcileFixture(t *testing.T) (*Repository, *captureIndexer, string, string) {
	t.Helper()

	db := openNotesTestDB(t)
	workspaceRoot := t.TempDir()
	projectRoot := filepath.Join(workspaceRoot, "compiler-lab")

	if err := os.MkdirAll(projectRoot, 0o755); err != nil {
		t.Fatalf("create project root: %v", err)
	}

	insertNotesTestWorkspace(t, db, "workspace-1", workspaceRoot)
	insertNotesTestProject(t, db, "project-1", "workspace-1", projectRoot)

	indexer := &captureIndexer{}

	return NewRepository(db, indexer, activities.NewRepository(db)), indexer, workspaceRoot, projectRoot
}

// A Markdown file somebody dropped into the workspace becomes a note.
func TestReconcileAdoptsAFileWrittenOutsideTheApp(t *testing.T) {
	repo, indexer, workspaceRoot, _ := reconcileFixture(t)

	path := filepath.Join(workspaceRoot, "written-in-another-editor.md")
	if err := os.WriteFile(path, []byte("# Notes\n\nTyped elsewhere."), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}

	changed, err := repo.Reconcile([]string{path})
	if err != nil {
		t.Fatalf("Reconcile: %v", err)
	}
	if !changed {
		t.Fatal("adopting a new file was not reported as a change")
	}

	notes, err := repo.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(notes) != 1 {
		t.Fatalf("got %d notes, want the one that appeared", len(notes))
	}

	// The name is the only thing the file says about itself that a person
	// chose, so it is where the title comes from.
	if notes[0].Title != "Written in another editor" {
		t.Errorf("Title = %q", notes[0].Title)
	}
	if notes[0].FilePath != path {
		t.Errorf("FilePath = %q, want %q", notes[0].FilePath, path)
	}

	// Findable straight away, rather than at whatever point something else
	// happens to reindex it.
	if len(indexer.entries) != 1 || indexer.entries[0].Body != "# Notes\n\nTyped elsewhere." {
		t.Errorf("indexed entries = %+v", indexer.entries)
	}
}

// A file inside a project folder belongs to that project, not to the root.
func TestReconcilePutsAnAdoptedFileInItsProject(t *testing.T) {
	repo, _, _, projectRoot := reconcileFixture(t)

	path := filepath.Join(projectRoot, "dropped-in.md")
	if err := os.WriteFile(path, []byte("inside a project"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}

	if _, err := repo.Reconcile([]string{path}); err != nil {
		t.Fatalf("Reconcile: %v", err)
	}

	notes, _ := repo.List()
	if len(notes) != 1 {
		t.Fatalf("got %d notes", len(notes))
	}
	if notes[0].ProjectID == nil || *notes[0].ProjectID != "project-1" {
		t.Errorf("ProjectID = %v, want project-1", notes[0].ProjectID)
	}
}

// An edit made in another program has to reach the search index, or the note is
// findable only by what it used to say.
func TestReconcileReindexesAFileEditedElsewhere(t *testing.T) {
	repo, indexer, _, _ := reconcileFixture(t)

	note, err := repo.Create(CreateNoteRequest{
		WorkspaceID: "workspace-1",
		Title:       "Kestrel",
		Content:     "listens on 8080",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	indexer.replacedEntries = nil

	// Written after the note's own updated_at, the way an edit made minutes
	// later is.
	if err := os.WriteFile(note.FilePath, []byte("listens on 7743"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	later := time.Now().Add(2 * time.Minute)
	if err := os.Chtimes(note.FilePath, later, later); err != nil {
		t.Fatalf("chtimes: %v", err)
	}

	changed, err := repo.Reconcile([]string{note.FilePath})
	if err != nil {
		t.Fatalf("Reconcile: %v", err)
	}
	if !changed {
		t.Fatal("an external edit was not reported as a change")
	}

	// Replaced rather than inserted: the note already had an entry, and a
	// second one would have it turn up twice in every search.
	if len(indexer.replacedEntries) != 1 || indexer.replacedEntries[0].Body != "listens on 7743" {
		t.Fatalf("replaced entries = %+v, want the new text", indexer.replacedEntries)
	}
	if indexer.replacedEntries[0].EntityID != note.ID {
		t.Errorf("reindexed %q, want the existing note %q", indexer.replacedEntries[0].EntityID, note.ID)
	}
}

// The app writes these files itself, and the watcher sees those writes too.
// Treating its own save as an external edit would have the interface reload
// every time the user stopped typing.
func TestReconcileIgnoresTheAppsOwnSave(t *testing.T) {
	repo, indexer, _, _ := reconcileFixture(t)

	note, err := repo.Create(CreateNoteRequest{
		WorkspaceID: "workspace-1",
		Title:       "Kestrel",
		Content:     "first",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	indexer.entries = nil
	indexer.replacedEntries = nil

	// Exactly what UpdateContent leaves behind: a file whose mtime is the
	// moment the app recorded as updated_at.
	changed, err := repo.Reconcile([]string{note.FilePath})
	if err != nil {
		t.Fatalf("Reconcile: %v", err)
	}
	if changed {
		t.Error("the app's own save was taken for an edit made elsewhere")
	}
	if len(indexer.entries)+len(indexer.replacedEntries) != 0 {
		t.Errorf("reindexed for its own write: %+v %+v", indexer.entries, indexer.replacedEntries)
	}
}

// A note whose file was deleted in Finder is a note that is gone.
func TestReconcileForgetsANoteWhoseFileWasDeleted(t *testing.T) {
	repo, _, _, _ := reconcileFixture(t)

	note, err := repo.Create(CreateNoteRequest{
		WorkspaceID: "workspace-1",
		Title:       "Temporary",
		Content:     "x",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	if err := os.Remove(note.FilePath); err != nil {
		t.Fatalf("remove: %v", err)
	}

	changed, err := repo.Reconcile([]string{note.FilePath})
	if err != nil {
		t.Fatalf("Reconcile: %v", err)
	}
	if !changed {
		t.Fatal("a deleted file was not reported as a change")
	}

	notes, _ := repo.List()
	if len(notes) != 0 {
		t.Errorf("the note is still listed: %+v", notes)
	}
}

// A file can appear again at a deleted note's path — restored from a backup,
// checked back out, put back by whatever wrote it in the first place, or simply
// left over from before deleting a note took its file with it.
//
// It has to come back as the note it was. A second row for one file splits the
// note's identity in two, and every link and search result still points at the
// half nothing can reach.
func TestReconcileRevivesADeletedNoteRatherThanDuplicatingIt(t *testing.T) {
	repo, indexer, _, _ := reconcileFixture(t)

	note, err := repo.Create(CreateNoteRequest{
		WorkspaceID: "workspace-1",
		Title:       "Parking queue ordering",
		Content:     "first draft",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	if err := repo.Delete(note.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}

	// Something puts a file back at that path.
	if err := os.WriteFile(note.FilePath, []byte("second draft"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	later := time.Now().Add(time.Hour)
	if err := os.Chtimes(note.FilePath, later, later); err != nil {
		t.Fatalf("chtimes: %v", err)
	}

	changed, err := repo.Reconcile([]string{note.FilePath})
	if err != nil {
		t.Fatalf("Reconcile: %v", err)
	}
	if !changed {
		t.Fatal("a deleted note's file coming back was not reported as a change")
	}

	notes, err := repo.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(notes) != 1 {
		t.Fatalf("got %d notes, want exactly the one that came back", len(notes))
	}

	// The same note, not a stranger wearing its file.
	if notes[0].ID != note.ID {
		t.Errorf("ID = %q, want the original %q", notes[0].ID, note.ID)
	}
	if notes[0].Title != "Parking queue ordering" {
		t.Errorf("Title = %q — read back out of the file name instead of kept", notes[0].Title)
	}
	if notes[0].CreatedAt != note.CreatedAt {
		t.Errorf("CreatedAt = %q, want the original %q", notes[0].CreatedAt, note.CreatedAt)
	}

	// Deleting took it out of the index; it is only findable again if this put
	// it back, with what the file says now.
	if len(indexer.replacedEntries) == 0 {
		t.Fatal("the revived note was not put back in the search index")
	}
	last := indexer.replacedEntries[len(indexer.replacedEntries)-1]
	if last.EntityID != note.ID || last.Body != "second draft" {
		t.Errorf("reindexed as %+v", last)
	}
}

// The ordinary end state: the note is deleted and so is its file. Nothing to
// bring back, and nothing to report.
func TestReconcileLeavesADeletedNoteWithNoFileAlone(t *testing.T) {
	repo, _, _, _ := reconcileFixture(t)

	note, err := repo.Create(CreateNoteRequest{
		WorkspaceID: "workspace-1",
		Title:       "Temporary",
		Content:     "x",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	// Deleting takes the file with it, so this is what the folder looks like
	// afterwards without any help.
	if err := repo.Delete(note.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}

	changed, err := repo.Reconcile([]string{note.FilePath})
	if err != nil {
		t.Fatalf("Reconcile: %v", err)
	}
	if changed {
		t.Error("a deleted note whose file is also gone was reported as a change")
	}

	notes, _ := repo.List()
	if len(notes) != 0 {
		t.Errorf("a note came back from nothing: %+v", notes)
	}
}

// Everything else in the folder is somebody else's business.
func TestReconcileIgnoresWhatIsNotANote(t *testing.T) {
	repo, _, workspaceRoot, _ := reconcileFixture(t)

	for _, name := range []string{"photo.png", "notes.txt", ".DS_Store"} {
		path := filepath.Join(workspaceRoot, name)
		if err := os.WriteFile(path, []byte("x"), 0o644); err != nil {
			t.Fatalf("write: %v", err)
		}
		changed, err := repo.Reconcile([]string{path})
		if err != nil {
			t.Fatalf("Reconcile(%s): %v", name, err)
		}
		if changed {
			t.Errorf("%s was treated as a note", name)
		}
	}

	notes, _ := repo.List()
	if len(notes) != 0 {
		t.Errorf("something that is not a note became one: %+v", notes)
	}
}

// A Markdown file outside every workspace is not this app's business either.
func TestReconcileLeavesFilesOutsideTheWorkspaceAlone(t *testing.T) {
	repo, _, _, _ := reconcileFixture(t)

	elsewhere := filepath.Join(t.TempDir(), "someone-elses.md")
	if err := os.WriteFile(elsewhere, []byte("not ours"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}

	changed, err := repo.Reconcile([]string{elsewhere})
	if err != nil {
		t.Fatalf("Reconcile: %v", err)
	}
	if changed {
		t.Error("a file outside every workspace was adopted")
	}
}

func TestTitleFromFileName(t *testing.T) {
	for _, testCase := range []struct{ in, want string }{
		{"/w/kestrel-service-notes.md", "Kestrel service notes"},
		{"/w/parking_queue.md", "Parking queue"},
		{"/w/Notes.md", "Notes"},
		{"/w/.md", "Untitled"},
	} {
		if got := titleFromFileName(testCase.in); got != testCase.want {
			t.Errorf("titleFromFileName(%q) = %q, want %q", testCase.in, got, testCase.want)
		}
	}
}

// The file is not the editor's alone. Somebody can change it in Finder while a
// window is open on it, and without this the next autosave writes over what
// they did from a copy read before the change.
func TestSavingOverAnEditMadeElsewhereIsRefused(t *testing.T) {
	repo, _, _, _ := reconcileFixture(t)

	note, err := repo.Create(CreateNoteRequest{
		WorkspaceID: "workspace-1",
		Title:       "Kestrel",
		Content:     "listens on 8080",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	readByTheEditor := note.UpdatedAt

	// Somebody edits it elsewhere, and the watcher reconciles it.
	if err := os.WriteFile(note.FilePath, []byte("listens on 7743"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	later := time.Now().Add(2 * time.Minute)
	if err := os.Chtimes(note.FilePath, later, later); err != nil {
		t.Fatalf("chtimes: %v", err)
	}
	if _, err := repo.Reconcile([]string{note.FilePath}); err != nil {
		t.Fatalf("Reconcile: %v", err)
	}

	// The editor, still holding what it read before, autosaves.
	_, err = repo.UpdateContent(note.ID, "listens on 8080 and is fine", readByTheEditor)

	var conflict *Conflict
	if !errors.As(err, &conflict) {
		t.Fatalf("err = %v, want a conflict", err)
	}

	// The other version comes back with it, or the editor would be asking
	// somebody to choose against something they cannot see.
	if conflict.OnDisk != "listens on 7743" {
		t.Errorf("conflict carried %q", conflict.OnDisk)
	}

	// And nothing was written.
	onDisk, _ := os.ReadFile(note.FilePath)
	if string(onDisk) != "listens on 7743" {
		t.Errorf("the file was overwritten anyway: %q", onDisk)
	}
}

// The window between an external edit and the watcher noticing it is small and
// real. A save that lands inside it must still be refused, or the protection is
// only as good as the filesystem's timing.
func TestSavingOverAnEditTheWatcherHasNotSeenYetIsRefused(t *testing.T) {
	repo, _, _, _ := reconcileFixture(t)

	note, err := repo.Create(CreateNoteRequest{
		WorkspaceID: "workspace-1",
		Title:       "Kestrel",
		Content:     "listens on 8080",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	// Edited on disk, and deliberately not reconciled — updated_at still says
	// what it said, so the expectation the editor sends still matches.
	if err := os.WriteFile(note.FilePath, []byte("listens on 7743"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	later := time.Now().Add(2 * time.Minute)
	if err := os.Chtimes(note.FilePath, later, later); err != nil {
		t.Fatalf("chtimes: %v", err)
	}

	_, err = repo.UpdateContent(note.ID, "from the editor", note.UpdatedAt)

	var conflict *Conflict
	if !errors.As(err, &conflict) {
		t.Fatalf("err = %v, want a conflict from the file being ahead of the row", err)
	}
}

// Having seen the conflict and chosen, the caller must be able to mean it.
func TestSavingWithNoExpectationWritesRegardless(t *testing.T) {
	repo, _, _, _ := reconcileFixture(t)

	note, err := repo.Create(CreateNoteRequest{
		WorkspaceID: "workspace-1",
		Title:       "Kestrel",
		Content:     "listens on 8080",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	if err := os.WriteFile(note.FilePath, []byte("changed elsewhere"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	later := time.Now().Add(2 * time.Minute)
	if err := os.Chtimes(note.FilePath, later, later); err != nil {
		t.Fatalf("chtimes: %v", err)
	}

	if _, err := repo.UpdateContent(note.ID, "mine wins", ""); err != nil {
		t.Fatalf("UpdateContent: %v", err)
	}

	onDisk, _ := os.ReadFile(note.FilePath)
	if string(onDisk) != "mine wins" {
		t.Errorf("file = %q, want the caller's version", onDisk)
	}
}

// The ordinary case: nobody else touched it, so the save goes through.
func TestAnUncontestedSaveIsNotAConflict(t *testing.T) {
	repo, _, _, _ := reconcileFixture(t)

	note, err := repo.Create(CreateNoteRequest{
		WorkspaceID: "workspace-1",
		Title:       "Kestrel",
		Content:     "first",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	if _, err := repo.UpdateContent(note.ID, "second", note.UpdatedAt); err != nil {
		t.Fatalf("an ordinary save was refused: %v", err)
	}

	onDisk, _ := os.ReadFile(note.FilePath)
	if string(onDisk) != "second" {
		t.Errorf("file = %q", onDisk)
	}
}
