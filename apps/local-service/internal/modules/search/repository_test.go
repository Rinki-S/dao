package search

import (
	"database/sql"
	"testing"

	_ "modernc.org/sqlite"
)

func TestBuildMatchQuery(t *testing.T) {
	tests := []struct {
		name  string
		query string
		want  string
	}{
		{
			name:  "empty",
			query: "",
			want:  "",
		},
		{
			name:  "whitespace",
			query: "   ",
			want:  "",
		},
		{
			name:  "multiple words",
			query: "redis cache",
			want:  `"redis"* "cache"*`,
		},
		{
			name:  "dotted technical term",
			query: "React.js",
			want:  `"React"* "js"*`,
		},
		{
			name:  "symbol heavy technical term",
			query: "C++",
			want:  `"C"*`,
		},
		{
			name:  "underscore technical term",
			query: "node_modules",
			want:  `"node"* "modules"*`,
		},
		{
			name:  "url",
			query: "http://localhost:5173",
			want:  `"http"* "localhost"* "5173"*`,
		},
		{
			name:  "cjk phrase",
			query: "缓存击穿",
			want:  `"缓存击穿"*`,
		},
		{
			name:  "invalid quote",
			query: `"bad query`,
			want:  `"bad"* "query"*`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := buildMatchQuery(tt.query)
			if got != tt.want {
				t.Fatalf("buildMatchQuery(%q) = %q, want %q", tt.query, got, tt.want)
			}
		})
	}
}

func TestRepositoryReplaceTx(t *testing.T) {
	db := openSearchTestDB(t)
	repo := NewRepository(db)

	tx, err := db.Begin()
	if err != nil {
		t.Fatalf("begin tx: %v", err)
	}

	if err := repo.IndexTx(tx, IndexEntry{
		EntityType:  "note",
		EntityID:    "note-1",
		WorkspaceID: "workspace-1",
		ProjectID:   nil,
		Title:       "Markdown Note",
		Body:        "old body",
		CreatedAt:   "2026-05-26T00:00:00Z",
		UpdatedAt:   "2026-05-26T00:00:00Z",
	}); err != nil {
		t.Fatalf("index tx: %v", err)
	}

	if err := repo.ReplaceTx(tx, IndexEntry{
		EntityType:  "note",
		EntityID:    "note-1",
		WorkspaceID: "workspace-1",
		ProjectID:   nil,
		Title:       "Markdown Note",
		Body:        "new body",
		CreatedAt:   "2026-05-26T00:00:00Z",
		UpdatedAt:   "2026-05-26T00:01:00Z",
	}); err != nil {
		t.Fatalf("replace tx: %v", err)
	}

	if err := tx.Commit(); err != nil {
		t.Fatalf("commit tx: %v", err)
	}

	oldResults, err := repo.Search("old")
	if err != nil {
		t.Fatalf("search old: %v", err)
	}

	if len(oldResults) != 0 {
		t.Fatalf("len(oldResults) = %d, want 0", len(oldResults))
	}

	newResults, err := repo.Search("new")
	if err != nil {
		t.Fatalf("search new: %v", err)
	}

	if len(newResults) != 1 {
		t.Fatalf("len(newResults) = %d, want 1", len(newResults))
	}
}

func TestRepositoryDeleteTx(t *testing.T) {
	db := openSearchTestDB(t)
	repo := NewRepository(db)

	tx, err := db.Begin()
	if err != nil {
		t.Fatalf("begin tx: %v", err)
	}

	if err := repo.IndexTx(tx, IndexEntry{
		EntityType:  "task",
		EntityID:    "task-1",
		WorkspaceID: "workspace-1",
		ProjectID:   nil,
		Title:       "Deleted task",
		Body:        "body",
		CreatedAt:   "2026-05-26T00:00:00Z",
		UpdatedAt:   "2026-05-26T00:00:00Z",
	}); err != nil {
		t.Fatalf("index tx: %v", err)
	}

	if err := repo.DeleteTx(tx, "task", "task-1"); err != nil {
		t.Fatalf("delete tx: %v", err)
	}

	if err := tx.Commit(); err != nil {
		t.Fatalf("commit tx: %v", err)
	}

	results, err := repo.Search("Deleted")
	if err != nil {
		t.Fatalf("search deleted: %v", err)
	}

	if len(results) != 0 {
		t.Fatalf("len(results) = %d, want 0", len(results))
	}
}

func openSearchTestDB(t *testing.T) *sql.DB {
	t.Helper()

	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() {
		db.Close()
	})

	_, err = db.Exec(`
		CREATE VIRTUAL TABLE search_index USING fts5(
			entity_type UNINDEXED,
			entity_id UNINDEXED,
			workspace_id UNINDEXED,
			project_id UNINDEXED,
			title,
			body,
			created_at UNINDEXED,
			updated_at UNINDEXED
		)
	`)
	if err != nil {
		t.Fatalf("create search index: %v", err)
	}

	return db
}
