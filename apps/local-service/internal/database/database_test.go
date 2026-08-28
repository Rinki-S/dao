package database

import (
	"database/sql"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/pressly/goose/v3"
)

// migrated opens a database the way the service does and brings it up to the
// real schema.
//
// The real migrations, not a fixture: the whole point of this package is that
// the REFERENCES clauses written in those files are now checked, and a test
// against a hand-written schema would only prove that SQLite can enforce a
// foreign key.
func migrated(t *testing.T) *sql.DB {
	t.Helper()

	db, err := Open(filepath.Join(t.TempDir(), "dao.db"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { db.Close() })

	if err := goose.SetDialect("sqlite3"); err != nil {
		t.Fatalf("set dialect: %v", err)
	}
	goose.SetLogger(goose.NopLogger())

	if err := goose.Up(db, filepath.Join("..", "..", "migrations")); err != nil {
		t.Fatalf("migrate up: %v", err)
	}

	return db
}

func TestEveryConnectionEnforcesForeignKeys(t *testing.T) {
	db := migrated(t)

	// Concurrently, to make the pool actually open more than one connection.
	// A pragma set after opening would land on one of them and this is the
	// cheapest way to notice.
	var group sync.WaitGroup
	results := make([]int, 16)

	for i := range results {
		group.Add(1)
		go func() {
			defer group.Done()
			if err := db.QueryRow("PRAGMA foreign_keys").Scan(&results[i]); err != nil {
				t.Errorf("read pragma: %v", err)
			}
		}()
	}

	group.Wait()

	for i, on := range results {
		if on != 1 {
			t.Fatalf("connection %d had foreign_keys=%d, want 1", i, on)
		}
	}
}

// The migrations run under enforcement. 00011 rebuilds the notes table the way
// SQLite requires — create, copy, drop, rename — and that dance behaves
// differently when foreign keys are on.
func TestMigrationsRunAndReverseUnderEnforcement(t *testing.T) {
	db := migrated(t)

	var violations int
	rows, err := db.Query("PRAGMA foreign_key_check")
	if err != nil {
		t.Fatalf("foreign_key_check: %v", err)
	}
	for rows.Next() {
		violations++
	}
	rows.Close()

	if violations != 0 {
		t.Fatalf("the migrated schema starts with %d foreign key violations", violations)
	}

	if err := goose.Down(db, filepath.Join("..", "..", "migrations")); err != nil {
		t.Fatalf("migrate down: %v", err)
	}
}

func TestAnOrphanIsRefused(t *testing.T) {
	db := migrated(t)

	// A note in a workspace that does not exist. This has been accepted
	// silently for the whole life of the table.
	_, err := db.Exec(`
		INSERT INTO notes (id, workspace_id, title, file_path, content_type, note_type,
		                   created_at, updated_at, version, sync_status)
		VALUES ('note-1', 'no-such-workspace', 'Orphan', '/tmp/orphan.md', 'markdown',
		        'general', '2026-08-28T00:00:00Z', '2026-08-28T00:00:00Z', 1, 'local')
	`)
	if err == nil {
		t.Fatal("a note referencing a workspace that does not exist was accepted")
	}
	if !strings.Contains(err.Error(), "FOREIGN KEY constraint failed") {
		t.Fatalf("refused for the wrong reason: %v", err)
	}
}

func TestTheCascadeFires(t *testing.T) {
	db := migrated(t)

	if _, err := db.Exec(`
		INSERT INTO chat_conversations (id, workspace_id, title, created_at, updated_at)
		VALUES ('chat-1', 'ws-1', 'A conversation', '2026-08-28T00:00:00Z', '2026-08-28T00:00:00Z')
	`); err != nil {
		t.Fatalf("insert conversation: %v", err)
	}

	if _, err := db.Exec(`
		INSERT INTO chat_messages (id, conversation_id, role, content, position, created_at)
		VALUES ('message-1', 'chat-1', 'user', 'hi', 0, '2026-08-28T00:00:00Z')
	`); err != nil {
		t.Fatalf("insert message: %v", err)
	}

	if _, err := db.Exec(`DELETE FROM chat_conversations WHERE id = 'chat-1'`); err != nil {
		t.Fatalf("delete conversation: %v", err)
	}

	var left int
	if err := db.QueryRow(`SELECT count(*) FROM chat_messages`).Scan(&left); err != nil {
		t.Fatalf("count messages: %v", err)
	}
	if left != 0 {
		t.Fatalf("%d messages survived their conversation", left)
	}
}
