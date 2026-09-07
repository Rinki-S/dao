package files

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// Names used to end in the entity's identifier — "welcome-note-01M0HSRYJE….md".
// This takes it off the ones already on disk.
//
// The rule is deliberately narrow: a name is only touched when it ends in a
// dash followed by exactly the identifier of the row that points at it. Nothing
// else on disk can match that, so a file the user named, or one another program
// left there, is never renamed. It also makes the pass idempotent for free —
// once the suffix is gone the name no longer matches, so a second run does
// nothing.

// StripIdentifiers renames everything in the workspace whose name still carries
// its id, and updates the paths the database holds for them.
//
// Deepest first. A rename only changes an entry's own last component, so a file
// renamed before its folder is still where the database says it is; doing it
// the other way round would invalidate every path below the folder before
// getting to them. Once a directory does move, every stored path underneath is
// rewritten to match.
func StripIdentifiers(db *sql.DB) error {
	if err := stripNoteNames(db); err != nil {
		return fmt.Errorf("notes: %w", err)
	}
	if err := stripFolderNames(db,
		"projects", "folder_path",
		`SELECT id, folder_path FROM projects WHERE deleted_at IS NULL`,
	); err != nil {
		return fmt.Errorf("projects: %w", err)
	}
	if err := stripFolderNames(db,
		"workspaces", "root_path",
		`SELECT id, root_path FROM workspaces WHERE deleted_at IS NULL`,
	); err != nil {
		return fmt.Errorf("workspaces: %w", err)
	}

	return nil
}

type entry struct {
	id   string
	path string
}

func stripNoteNames(db *sql.DB) error {
	notes, err := readEntries(db, `SELECT id, file_path FROM notes WHERE deleted_at IS NULL`)
	if err != nil {
		return err
	}

	for _, note := range notes {
		base := filepath.Base(note.path)
		name := strings.TrimSuffix(base, ".md")

		trimmed, ok := withoutIdentifier(name, note.id)
		if !ok {
			continue
		}

		next := FreePath(filepath.Dir(note.path), trimmed, ".md", note.path)
		if err := move(note.path, next); err != nil {
			return err
		}
		if _, err := db.Exec(`UPDATE notes SET file_path = ? WHERE id = ?`, next, note.id); err != nil {
			return err
		}
	}

	return nil
}

func stripFolderNames(db *sql.DB, table string, column string, query string) error {
	folders, err := readEntries(db, query)
	if err != nil {
		return err
	}

	// Deepest first, so a nested project is renamed before the one containing
	// it and never has the ground moved under it mid-pass.
	sort.Slice(folders, func(a, b int) bool {
		return strings.Count(folders[a].path, string(os.PathSeparator)) >
			strings.Count(folders[b].path, string(os.PathSeparator))
	})

	for _, folder := range folders {
		trimmed, ok := withoutIdentifier(filepath.Base(folder.path), folder.id)
		if !ok {
			continue
		}

		next := FreePath(filepath.Dir(folder.path), trimmed, "", folder.path)
		if err := move(folder.path, next); err != nil {
			return err
		}
		if _, err := db.Exec(
			fmt.Sprintf(`UPDATE %s SET %s = ? WHERE id = ?`, table, column), next, folder.id,
		); err != nil {
			return err
		}
		if err := rewriteDescendants(db, folder.path, next); err != nil {
			return err
		}
	}

	return nil
}

// rewriteDescendants points every stored path under a moved directory at where
// it now is. String surgery on absolute paths, because that is what a directory
// rename does to them — the entries themselves have not moved relative to it.
func rewriteDescendants(db *sql.DB, from string, to string) error {
	prefix := strings.TrimSuffix(from, string(os.PathSeparator)) + string(os.PathSeparator)
	replacement := strings.TrimSuffix(to, string(os.PathSeparator)) + string(os.PathSeparator)

	for _, update := range []struct{ table, column string }{
		{"projects", "folder_path"},
		{"notes", "file_path"},
	} {
		if _, err := db.Exec(fmt.Sprintf(
			`UPDATE %s SET %s = ? || substr(%s, ?) WHERE %s LIKE ? ESCAPE '\'`,
			update.table, update.column, update.column, update.column,
		), replacement, len(prefix)+1, likePrefix(prefix)); err != nil {
			return err
		}
	}

	return nil
}

// likePrefix escapes the wildcards LIKE would otherwise read in a path. A
// folder called "100%" is unusual and not impossible.
func likePrefix(prefix string) string {
	escaped := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(prefix)

	return escaped + "%"
}

// withoutIdentifier takes "welcome-note-01M0HSRYJE…" down to "welcome-note",
// and reports false for a name that does not end in exactly this id.
func withoutIdentifier(name string, id string) (string, bool) {
	suffix := "-" + id
	if id == "" || !strings.HasSuffix(name, suffix) {
		return "", false
	}

	trimmed := strings.TrimSuffix(name, suffix)
	if trimmed == "" {
		// A note titled only in punctuation slugs to "untitled", so this
		// should not happen — but a name that is nothing but an id would
		// otherwise become the empty string, which is not a filename.
		return "untitled", true
	}

	return trimmed, true
}

// move renames a path, and treats "it is already there" as done rather than as
// a failure — a pass interrupted between the rename and the database update
// finds its own work on the next run.
func move(from string, to string) error {
	if from == to {
		return nil
	}
	if _, err := os.Stat(from); os.IsNotExist(err) {
		return nil
	}

	return os.Rename(from, to)
}

func readEntries(db *sql.DB, query string) ([]entry, error) {
	rows, err := db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []entry
	for rows.Next() {
		var found entry
		if err := rows.Scan(&found.id, &found.path); err != nil {
			return nil, err
		}
		if found.path != "" {
			entries = append(entries, found)
		}
	}

	return entries, rows.Err()
}
