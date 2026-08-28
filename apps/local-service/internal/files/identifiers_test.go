package files

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	_ "modernc.org/sqlite"
)

// A workspace laid out the old way: every name ending in the row's identifier.
func oldLayout(t *testing.T) (*sql.DB, string) {
	t.Helper()

	root := t.TempDir()
	db, err := sql.Open("sqlite", filepath.Join(root, "test.db"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { db.Close() })

	if _, err := db.Exec(`
		CREATE TABLE workspaces (id TEXT PRIMARY KEY, root_path TEXT, deleted_at TEXT);
		CREATE TABLE projects (id TEXT PRIMARY KEY, folder_path TEXT, deleted_at TEXT);
		CREATE TABLE notes (id TEXT PRIMARY KEY, file_path TEXT, deleted_at TEXT);
	`); err != nil {
		t.Fatalf("schema: %v", err)
	}

	workspaceRoot := filepath.Join(root, "personal-01WORKSPACE")
	projectDir := filepath.Join(workspaceRoot, "compiler-lab-01PROJECT")
	nested := filepath.Join(projectDir, "parser-01NESTED")

	for _, dir := range []string{workspaceRoot, projectDir, nested} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("mkdir: %v", err)
		}
	}

	rootNote := filepath.Join(workspaceRoot, "welcome-note-01ROOTNOTE.md")
	deepNote := filepath.Join(nested, "recovery-01DEEPNOTE.md")
	for _, path := range []string{rootNote, deepNote} {
		if err := os.WriteFile(path, []byte("body of "+filepath.Base(path)), 0o644); err != nil {
			t.Fatalf("write: %v", err)
		}
	}

	// One statement per Exec. A multi-statement Exec binds its arguments to the
	// first statement only, which silently files every row under the wrong
	// path — which is exactly the bug this fixture is meant to detect.
	for _, seed := range []struct {
		query string
		args  []any
	}{
		{`INSERT INTO workspaces VALUES ('01WORKSPACE', ?, NULL)`, []any{workspaceRoot}},
		{`INSERT INTO projects VALUES ('01PROJECT', ?, NULL)`, []any{projectDir}},
		{`INSERT INTO projects VALUES ('01NESTED', ?, NULL)`, []any{nested}},
		{`INSERT INTO notes VALUES ('01ROOTNOTE', ?, NULL)`, []any{rootNote}},
		{`INSERT INTO notes VALUES ('01DEEPNOTE', ?, NULL)`, []any{deepNote}},
	} {
		if _, err := db.Exec(seed.query, seed.args...); err != nil {
			t.Fatalf("seed: %v", err)
		}
	}

	return db, root
}

func paths(t *testing.T, db *sql.DB, query string) map[string]string {
	t.Helper()

	rows, err := db.Query(query)
	if err != nil {
		t.Fatalf("query: %v", err)
	}
	defer rows.Close()

	found := map[string]string{}
	for rows.Next() {
		var id, path string
		if err := rows.Scan(&id, &path); err != nil {
			t.Fatalf("scan: %v", err)
		}
		found[id] = path
	}

	return found
}

func TestStripIdentifiersRenamesEverythingAndKeepsThePathsTrue(t *testing.T) {
	db, root := oldLayout(t)

	if err := StripIdentifiers(db); err != nil {
		t.Fatalf("StripIdentifiers: %v", err)
	}

	workspace := filepath.Join(root, "personal")
	project := filepath.Join(workspace, "compiler-lab")
	nested := filepath.Join(project, "parser")

	// Every name is now the one a person would read.
	for _, dir := range []string{workspace, project, nested} {
		if _, err := os.Stat(dir); err != nil {
			t.Errorf("%s is not there: %v", dir, err)
		}
	}

	// And the database points at where things actually are — including the note
	// three directories down, whose path changed twice without it being touched
	// after the first pass.
	notes := paths(t, db, `SELECT id, file_path FROM notes`)
	wantDeep := filepath.Join(nested, "recovery.md")
	if notes["01DEEPNOTE"] != wantDeep {
		t.Errorf("deep note recorded at %q, want %q", notes["01DEEPNOTE"], wantDeep)
	}
	if _, err := os.Stat(wantDeep); err != nil {
		t.Errorf("deep note is not on disk where it says: %v", err)
	}

	// The content came along, rather than a new empty file being made.
	body, err := os.ReadFile(wantDeep)
	if err != nil || string(body) != "body of recovery-01DEEPNOTE.md" {
		t.Errorf("content = %q, err = %v", body, err)
	}

	projects := paths(t, db, `SELECT id, folder_path FROM projects`)
	if projects["01NESTED"] != nested {
		t.Errorf("nested project recorded at %q, want %q", projects["01NESTED"], nested)
	}
}

// It runs at every startup, so running it twice must be the same as once.
func TestStripIdentifiersIsIdempotent(t *testing.T) {
	db, _ := oldLayout(t)

	if err := StripIdentifiers(db); err != nil {
		t.Fatalf("first pass: %v", err)
	}
	first := paths(t, db, `SELECT id, file_path FROM notes`)

	if err := StripIdentifiers(db); err != nil {
		t.Fatalf("second pass: %v", err)
	}
	second := paths(t, db, `SELECT id, file_path FROM notes`)

	for id, path := range first {
		if second[id] != path {
			t.Errorf("%s moved on the second run: %q -> %q", id, path, second[id])
		}
	}
}

// Only names ending in exactly this row's id are touched. Anything else in the
// folder belongs to the user, or to another program, and is not ours to rename.
func TestNamesThatAreNotOursAreLeftAlone(t *testing.T) {
	db, root := oldLayout(t)

	workspaceRoot := filepath.Join(root, "personal-01WORKSPACE")
	theirs := filepath.Join(workspaceRoot, "my own file-2026.md")
	if err := os.WriteFile(theirs, []byte("mine"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}

	// A note whose name never carried an id — one the user renamed in Finder.
	plain := filepath.Join(workspaceRoot, "already-plain.md")
	if err := os.WriteFile(plain, []byte("plain"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO notes VALUES ('01PLAIN', ?, NULL)`, plain); err != nil {
		t.Fatalf("seed: %v", err)
	}

	if err := StripIdentifiers(db); err != nil {
		t.Fatalf("StripIdentifiers: %v", err)
	}

	// The workspace folder moved, so both are one directory over — but neither
	// name changed.
	moved := filepath.Join(root, "personal")
	if _, err := os.Stat(filepath.Join(moved, "my own file-2026.md")); err != nil {
		t.Errorf("a file that was not ours was renamed: %v", err)
	}
	if got := paths(t, db, `SELECT id, file_path FROM notes`)["01PLAIN"]; got !=
		filepath.Join(moved, "already-plain.md") {
		t.Errorf("a note already named plainly was recorded at %q", got)
	}
}

// Two notes whose titles slug the same used to be kept apart by their ids.
func TestATakenNameIsNumberedRatherThanOverwritten(t *testing.T) {
	db, root := oldLayout(t)

	workspaceRoot := filepath.Join(root, "personal-01WORKSPACE")
	twin := filepath.Join(workspaceRoot, "welcome-note-01TWIN.md")
	if err := os.WriteFile(twin, []byte("the twin"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO notes VALUES ('01TWIN', ?, NULL)`, twin); err != nil {
		t.Fatalf("seed: %v", err)
	}

	if err := StripIdentifiers(db); err != nil {
		t.Fatalf("StripIdentifiers: %v", err)
	}

	notes := paths(t, db, `SELECT id, file_path FROM notes`)
	if notes["01ROOTNOTE"] == notes["01TWIN"] {
		t.Fatalf("both notes ended up at %q", notes["01TWIN"])
	}
	for id, path := range notes {
		body, err := os.ReadFile(path)
		if err != nil {
			t.Errorf("%s: %v", id, err)
		}
		if len(body) == 0 {
			t.Errorf("%s lost its content", id)
		}
	}
}

func TestWithoutIdentifier(t *testing.T) {
	for _, testCase := range []struct {
		name, in, id, want string
		ok                 bool
	}{
		{"strips it", "welcome-note-01ABC", "01ABC", "welcome-note", true},
		{"a different id is not ours", "welcome-note-01ABC", "01XYZ", "", false},
		{"no id at all", "welcome-note", "01ABC", "", false},
		{"the id alone", "01ABC", "01ABC", "", false},
		{"an id inside is not a suffix", "01ABC-welcome", "01ABC", "", false},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			got, ok := withoutIdentifier(testCase.in, testCase.id)
			if ok != testCase.ok || (ok && got != testCase.want) {
				t.Errorf("withoutIdentifier(%q, %q) = %q, %v", testCase.in, testCase.id, got, ok)
			}
		})
	}
}
