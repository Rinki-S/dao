package notes

import (
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/oklog/ulid/v2"
	"github.com/rinki-s/dao/apps/local-service/internal/modules/search"
)

// Reconcile brings the notes table in line with what is actually on disk at the
// given paths.
//
// The watcher says what changed; this decides what that means. Five cases, and
// they are the whole of it:
//
//	a note's file was edited   -> the note is newer than the app thought
//	a note's file is gone      -> the note is gone
//	a deleted note's file back -> the note it used to be, not a new one
//	a file nobody knows about  -> a new note
//	a path with neither        -> nothing to do
//
// Returns whether anything changed, so a caller can avoid telling the interface
// to redraw for a batch that turned out to be the app's own footprints.
func (r *Repository) Reconcile(paths []string) (bool, error) {
	changed := false

	for _, path := range paths {
		did, err := r.reconcileOne(path)
		if err != nil {
			// One unreadable file should not abandon the rest of the batch —
			// the others are unrelated and equally real.
			continue
		}
		changed = changed || did
	}

	return changed, nil
}

func (r *Repository) reconcileOne(path string) (bool, error) {
	if !strings.EqualFold(filepath.Ext(path), ".md") {
		return false, nil
	}

	note, found, err := r.byPath(path)
	if err != nil {
		return false, err
	}

	info, statErr := os.Stat(path)
	exists := statErr == nil && !info.IsDir()
	deleted := found && note.DeletedAt != nil

	switch {
	case found && !deleted && exists:
		return r.refresh(note, info)
	case found && !deleted && !exists:
		return true, r.Delete(note.ID)
	case deleted && exists:
		return r.revive(note, info)
	case !found && exists:
		return r.adopt(path, info)
	}

	// A deleted note whose file is also gone is the ordinary end state, and the
	// only case left.
	return false, nil
}

// revive brings back a note that was deleted but whose file somebody edited
// again.
//
// Deleting a note only marks the row; the file stays where the person put it.
// So a deleted note leaves a real Markdown file in the workspace, and the next
// time anything writes to it the watcher reports a path the app has a row for —
// just not a live one. Adopting it would insert a *second* row for one file,
// under a new identifier, with the title read back out of the file name; the
// note would return as a stranger, and every link, recent and search result
// pointing at the original would go on pointing at a row nothing can reach.
//
// Reviving is the truthful reading. The file was never a new file — it is the
// same one, with the same history, and somebody has just said they still want
// it by writing to it.
func (r *Repository) revive(note Note, info os.FileInfo) (bool, error) {
	content, err := os.ReadFile(note.FilePath)
	if err != nil {
		return false, err
	}

	now := info.ModTime().UTC().Format(time.RFC3339)

	tx, err := r.db.Begin()
	if err != nil {
		return false, err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`
		UPDATE notes
		SET deleted_at = NULL, updated_at = ?, version = version + 1, sync_status = 'local'
		WHERE id = ?
	`, now, note.ID); err != nil {
		return false, err
	}

	// Deleting took the note out of the index, so it has to go back in.
	// Replace rather than insert: the delete is the only thing that should have
	// removed it, and this must not depend on that having happened.
	if err := r.indexer.ReplaceTx(tx, search.IndexEntry{
		EntityType:  "note",
		EntityID:    note.ID,
		WorkspaceID: note.WorkspaceID,
		ProjectID:   note.ProjectID,
		Title:       note.Title,
		Body:        string(content),
		CreatedAt:   note.CreatedAt,
		UpdatedAt:   now,
	}); err != nil {
		return false, err
	}

	return true, tx.Commit()
}

// refresh records that a note's file was edited somewhere else.
//
// The app's own saves reach here too — it writes the file, the watcher sees it.
// They are told apart by time: a save sets updated_at, so a file whose mtime is
// not meaningfully newer than that is one this app just wrote. The tolerance is
// a second because updated_at is stored to the second, and comparing a
// nanosecond mtime against it would call every one of the app's own writes an
// external edit.
//
// The cost of the tolerance is an edit made within a second of the app's own
// save, by hand, in another program. The cost of not having it is the interface
// reloading every time the user stops typing.
func (r *Repository) refresh(note Note, info os.FileInfo) (bool, error) {
	saved, err := time.Parse(time.RFC3339, note.UpdatedAt)
	if err == nil && !info.ModTime().After(saved.Add(time.Second)) {
		return false, nil
	}

	content, err := os.ReadFile(note.FilePath)
	if err != nil {
		return false, err
	}

	now := info.ModTime().UTC().Format(time.RFC3339)

	tx, err := r.db.Begin()
	if err != nil {
		return false, err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`
		UPDATE notes SET updated_at = ?, version = version + 1, sync_status = 'local'
		WHERE id = ?
	`, now, note.ID); err != nil {
		return false, err
	}

	// The search index holds the body, so an edit made elsewhere is not
	// findable until this runs.
	if err := r.indexer.ReplaceTx(tx, search.IndexEntry{
		EntityType:  "note",
		EntityID:    note.ID,
		WorkspaceID: note.WorkspaceID,
		ProjectID:   note.ProjectID,
		Title:       note.Title,
		Body:        string(content),
		CreatedAt:   note.CreatedAt,
		UpdatedAt:   now,
	}); err != nil {
		return false, err
	}

	return true, tx.Commit()
}

// adopt turns a Markdown file somebody put in the workspace into a note.
//
// Its title comes from the file name, because that is the only thing the file
// says about itself that a person chose. Reading a heading out of the content
// would be a guess that goes wrong the first time a note opens with a quote.
func (r *Repository) adopt(path string, info os.FileInfo) (bool, error) {
	dir := filepath.Dir(path)

	workspaceID, err := r.workspaceForDir(dir)
	if err != nil || workspaceID == "" {
		// A Markdown file outside every workspace is not this app's business.
		return false, err
	}

	projectID, err := r.projectForDir(dir)
	if err != nil {
		return false, err
	}

	content, err := os.ReadFile(path)
	if err != nil {
		return false, err
	}

	created := info.ModTime().UTC().Format(time.RFC3339)
	note := Note{
		ID:          ulid.Make().String(),
		WorkspaceID: workspaceID,
		ProjectID:   projectID,
		Title:       titleFromFileName(path),
		FilePath:    path,
		ContentType: "markdown",
		NoteType:    "general",
		CreatedAt:   created,
		UpdatedAt:   created,
		Version:     1,
		SyncStatus:  "local",
	}

	tx, err := r.db.Begin()
	if err != nil {
		return false, err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`
		INSERT INTO notes (
			id, workspace_id, project_id, title, file_path, content_type, note_type,
			created_at, updated_at, deleted_at, version, sync_status
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
	`, note.ID, note.WorkspaceID, note.ProjectID, note.Title, note.FilePath,
		note.ContentType, note.NoteType, note.CreatedAt, note.UpdatedAt,
		note.Version, note.SyncStatus); err != nil {
		return false, err
	}

	if err := r.indexer.IndexTx(tx, search.IndexEntry{
		EntityType:  "note",
		EntityID:    note.ID,
		WorkspaceID: note.WorkspaceID,
		ProjectID:   note.ProjectID,
		Title:       note.Title,
		Body:        string(content),
		CreatedAt:   note.CreatedAt,
		UpdatedAt:   note.UpdatedAt,
	}); err != nil {
		return false, err
	}

	return true, tx.Commit()
}

// titleFromFileName turns "kestrel-service-notes.md" back into something a
// person would have typed.
//
// It cannot recover the original — "kestrel-service-notes" was already the
// slug of "Kestrel service notes", and the slug threw the capitals away. So
// this is a reasonable reading of the name rather than a reversal of it, which
// is the honest most that can be done with a file somebody else named.
func titleFromFileName(path string) string {
	name := strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))
	name = strings.NewReplacer("-", " ", "_", " ").Replace(name)
	name = strings.Join(strings.Fields(name), " ")

	if name == "" {
		return "Untitled"
	}

	return strings.ToUpper(name[:1]) + name[1:]
}

// byPath finds the note a file belongs to, deleted or not.
//
// Deliberately unfiltered. Every other lookup in the app wants live notes and
// nothing else, but this one is asking "does this app already know this file?",
// and a deleted note knows its file perfectly well — hiding it here is what
// turns a revival into a duplicate.
//
// Live rows sort first so that a workspace which already collected a duplicate
// pair for one path resolves to the one the interface is showing.
func (r *Repository) byPath(path string) (Note, bool, error) {
	note, err := scanNote(r.db.QueryRow(`
		SELECT `+noteSelectColumns+`
		FROM notes
		WHERE file_path = ?
		ORDER BY (deleted_at IS NULL) DESC
		LIMIT 1
	`, path))
	if errors.Is(err, sql.ErrNoRows) {
		return Note{}, false, nil
	}
	if err != nil {
		return Note{}, false, err
	}

	return note, true, nil
}

// workspaceForDir finds the workspace a directory sits in, taking the longest
// root that contains it — workspaces can nest, and the innermost one owns it.
func (r *Repository) workspaceForDir(dir string) (string, error) {
	rows, err := r.db.Query(`SELECT id, root_path FROM workspaces WHERE deleted_at IS NULL`)
	if err != nil {
		return "", err
	}
	defer rows.Close()

	best, bestLen := "", -1
	for rows.Next() {
		var id, root string
		if err := rows.Scan(&id, &root); err != nil {
			return "", err
		}
		if under(dir, root) && len(root) > bestLen {
			best, bestLen = id, len(root)
		}
	}

	return best, rows.Err()
}

// projectForDir is the project whose folder is exactly this directory, or none
// for a note sitting at the workspace root.
func (r *Repository) projectForDir(dir string) (*string, error) {
	var id string
	err := r.db.QueryRow(
		`SELECT id FROM projects WHERE folder_path = ? AND deleted_at IS NULL`, dir,
	).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return &id, nil
}

// under reports whether dir is root or sits inside it. Compared as path
// segments rather than as strings, so "/a/notebook" is not inside "/a/note".
func under(dir string, root string) bool {
	if root == "" {
		return false
	}

	relative, err := filepath.Rel(root, dir)

	return err == nil && relative != ".." && !strings.HasPrefix(relative, ".."+string(os.PathSeparator))
}
