package files

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSlugifyName(t *testing.T) {
	for _, testCase := range []struct{ name, in, want string }{
		{"plain", "Kestrel service notes", "kestrel-service-notes"},
		{"collapses punctuation", "What is SSE? (a note)", "what-is-sse-a-note"},
		{"trims dashes", "  -- Draft --  ", "draft"},
		{"a slash is not a directory", "notes/2026", "notes-2026"},
		{"nothing usable", "!!!", "untitled"},
		{"empty", "", "untitled"},
		// The name is for a person to read, and the person may not be writing
		// in Latin. Dropping these would title every Chinese note "untitled".
		{"keeps Chinese", "解析器恢复策略", "解析器恢复策略"},
		{"keeps digits", "Plan 2026", "plan-2026"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			if got := SlugifyName(testCase.in); got != testCase.want {
				t.Errorf("SlugifyName(%q) = %q, want %q", testCase.in, got, testCase.want)
			}
		})
	}
}

// The identifier used to guarantee this. Two notes can be called "Notes", and
// the second one must not overwrite the first.
func TestASecondNameOfTheSameTitleIsNumbered(t *testing.T) {
	dir := t.TempDir()

	first := MarkdownNoteFilePath(dir, "Notes", "")
	if filepath.Base(first) != "notes.md" {
		t.Fatalf("first = %q, want notes.md", filepath.Base(first))
	}
	write(t, first)

	second := MarkdownNoteFilePath(dir, "Notes", "")
	if filepath.Base(second) != "notes-2.md" {
		t.Fatalf("second = %q, want notes-2.md", filepath.Base(second))
	}
	write(t, second)

	if third := MarkdownNoteFilePath(dir, "Notes", ""); filepath.Base(third) != "notes-3.md" {
		t.Errorf("third = %q, want notes-3.md", filepath.Base(third))
	}
}

// Renaming a note to the title it already has must not move it to "notes-2.md".
// Its own file is not something it collides with.
func TestANoteDoesNotCollideWithItself(t *testing.T) {
	dir := t.TempDir()

	existing := filepath.Join(dir, "notes.md")
	write(t, existing)

	if got := MarkdownNoteFilePath(dir, "Notes", existing); got != existing {
		t.Errorf("got %q, want the file it already has (%q)", got, existing)
	}
}

// A folder and a file are both entries in a directory, and the numbering has to
// work the same for both.
func TestFoldersAreNumberedToo(t *testing.T) {
	dir := t.TempDir()

	first := ProjectFolderPath(dir, "Inbox", "")
	if filepath.Base(first) != "inbox" {
		t.Fatalf("first = %q", filepath.Base(first))
	}
	if err := os.Mkdir(first, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}

	if second := ProjectFolderPath(dir, "Inbox", ""); filepath.Base(second) != "inbox-2" {
		t.Errorf("second = %q, want inbox-2", filepath.Base(second))
	}
}

// The disk this runs on is usually case-insensitive, where "Notes.md" and
// "notes.md" are one file. A check that missed that would hand back a path that
// silently overwrites.
func TestATakenNameIsTakenWhateverItsCase(t *testing.T) {
	dir := t.TempDir()
	write(t, filepath.Join(dir, "Notes.md"))

	got := MarkdownNoteFilePath(dir, "notes", "")
	if filepath.Base(got) == "notes.md" {
		// Only meaningful on a case-insensitive filesystem; on a sensitive one
		// the two really are different files and notes.md is free.
		if _, err := os.Stat(filepath.Join(dir, "notes.md")); err == nil {
			t.Error("handed back a name that already exists in another case")
		}
	}
}

// No identifier anywhere in what a person sees.
func TestNamesCarryNoIdentifier(t *testing.T) {
	dir := t.TempDir()

	for _, path := range []string{
		WorkspaceFolderPath(dir, "Personal"),
		ProjectFolderPath(dir, "AI Test Data", ""),
		MarkdownNoteFilePath(dir, "Kestrel service notes", ""),
	} {
		if name := filepath.Base(path); len(name) > 40 {
			t.Errorf("%q looks like it still carries an id", name)
		}
	}

	if got := filepath.Base(MarkdownNoteFilePath(dir, "Kestrel service notes", "")); got !=
		"kestrel-service-notes.md" {
		t.Errorf("note file = %q", got)
	}
}

func write(t *testing.T, path string) {
	t.Helper()

	if err := os.WriteFile(path, []byte("x"), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}
