// Package files decides what a workspace looks like on disk.
//
// The names here are the ones a person sees in Finder, so they are the names a
// person would have chosen: "kestrel-service-notes.md", not
// "kestrel-service-notes-01M145HP6EEYPF7QHN67PWXAE0.md". An app whose whole
// promise is that your notes are ordinary files in an ordinary folder cannot
// fill that folder with identifiers meant for the database.
//
// The identifier was doing one job worth keeping: making every name unique.
// Two notes can be called "Notes" and two projects can be called "Inbox". So
// the directory is consulted instead, and a name already taken gets a number,
// the way every other program on the machine does it.
package files

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"unicode"
)

// maxSuffix bounds the search for a free name.
//
// A thousand notes called "Notes" in one folder is not a case worth supporting,
// and looping until the filesystem gives up is worse than saying so.
const maxSuffix = 1000

// WorkspaceFolderPath is where a new workspace lives under the working
// directory.
func WorkspaceFolderPath(workingDirectory string, name string) string {
	return FreePath(workingDirectory, SlugifyName(name), "", "")
}

// ProjectFolderPath is where a project folder lives under its parent.
//
// keep is a path that does not count as taken — the folder this project is
// already in, when it is being renamed. Without it, renaming "Inbox" to "Inbox"
// would move it to "inbox-2".
func ProjectFolderPath(parentDir string, name string, keep string) string {
	return FreePath(parentDir, SlugifyName(name), "", keep)
}

// MarkdownNoteFilePath is where a note's file lives under its parent.
func MarkdownNoteFilePath(parentDir string, title string, keep string) string {
	return FreePath(parentDir, SlugifyName(title), ".md", keep)
}

// FreePath returns a path under dir for base+extension that nothing occupies.
//
// The check is a stat rather than a directory listing, so it is the filesystem's
// own answer about whether the name is taken — which on a case-insensitive disk
// means "notes.md" is correctly reported as taken by "Notes.md".
//
// It is a guess, not a reservation: nothing stops another process from creating
// the same name in between. The callers write immediately and the workspace has
// one writer, so the window is not worth a lock file; a caller that cared would
// have to create the file itself to be sure.
func FreePath(dir string, base string, extension string, keep string) string {
	for suffix := 1; suffix <= maxSuffix; suffix++ {
		name := base + extension
		if suffix > 1 {
			name = fmt.Sprintf("%s-%d%s", base, suffix, extension)
		}

		candidate := filepath.Join(dir, name)
		if keep != "" && sameFile(candidate, keep) {
			return candidate
		}
		if _, err := os.Stat(candidate); os.IsNotExist(err) {
			return candidate
		}
	}

	// Past the bound the name is not the problem any more. Returning the
	// unnumbered path lets the caller fail on the write, where the error can
	// say what it was trying to do.
	return filepath.Join(dir, base+extension)
}

// sameFile reports whether two paths name the same entry, without asking the
// filesystem to compare inodes — one of them usually does not exist yet.
// Compared case-insensitively because the disk this runs on usually is.
func sameFile(a string, b string) bool {
	return strings.EqualFold(filepath.Clean(a), filepath.Clean(b))
}

// SlugifyName turns a title into a filename.
//
// Lowercase, letters and digits kept, everything else collapsed to a single
// dash. Deliberately not "the title verbatim": a title can hold a slash, which
// is a directory separator, and a colon, which some filesystems still refuse.
func SlugifyName(name string) string {
	normalized := strings.ToLower(strings.TrimSpace(name))
	var builder strings.Builder
	previousDash := false

	for _, value := range normalized {
		// Letters and digits of any script, so a note titled in Chinese keeps
		// its title rather than becoming "untitled".
		if unicode.IsLetter(value) || unicode.IsDigit(value) {
			builder.WriteRune(value)
			previousDash = false
			continue
		}

		if !previousDash {
			builder.WriteRune('-')
			previousDash = true
		}
	}

	slug := strings.Trim(builder.String(), "-")
	if slug == "" {
		return "untitled"
	}

	return slug
}

func EnsureDir(path string) error {
	return os.MkdirAll(path, 0755)
}
