package activities

import (
	"database/sql"
	"testing"

	_ "modernc.org/sqlite"
)

func TestRepositoryCreateTxAndList(t *testing.T) {
	db := openTestDB(t)
	repo := NewRepository(db)

	projectID := "project-1"

	tx, err := db.Begin()
	if err != nil {
		t.Fatalf("begin tx: %v", err)
	}

	first, err := repo.CreateTx(tx, CreateActivityRequest{
		WorkspaceID:  "workspace-1",
		ProjectID:    nil,
		EntityType:   "workspace",
		EntityID:     "workspace-1",
		Action:       "created",
		MetadataJSON: "",
	})
	if err != nil {
		t.Fatalf("create first activity: %v", err)
	}

	second, err := repo.CreateTx(tx, CreateActivityRequest{
		WorkspaceID:  "workspace-1",
		ProjectID:    &projectID,
		EntityType:   "project",
		EntityID:     projectID,
		Action:       "created",
		MetadataJSON: `{"name":"Dao"}`,
	})
	if err != nil {
		t.Fatalf("create second activity: %v", err)
	}

	if err := tx.Commit(); err != nil {
		t.Fatalf("commit tx: %v", err)
	}

	activities, err := repo.List()
	if err != nil {
		t.Fatalf("list activities: %v", err)
	}

	if len(activities) != 2 {
		t.Fatalf("len(activities) = %d, want 2", len(activities))
	}

	if activities[0].ID != second.ID {
		t.Fatalf("activities[0].ID = %q, want newest activity %q", activities[0].ID, second.ID)
	}

	if activities[0].ProjectID == nil || *activities[0].ProjectID != projectID {
		t.Fatalf("activities[0].ProjectID = %v, want %q", activities[0].ProjectID, projectID)
	}

	if activities[0].MetadataJSON != `{"name":"Dao"}` {
		t.Fatalf("activities[0].MetadataJSON = %q", activities[0].MetadataJSON)
	}

	if activities[1].ID != first.ID {
		t.Fatalf("activities[1].ID = %q, want first activity %q", activities[1].ID, first.ID)
	}

	if activities[1].MetadataJSON != "{}" {
		t.Fatalf("activities[1].MetadataJSON = %q, want default metadata", activities[1].MetadataJSON)
	}
}

func openTestDB(t *testing.T) *sql.DB {
	t.Helper()

	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() {
		db.Close()
	})

	_, err = db.Exec(`
		CREATE TABLE activities (
			id TEXT PRIMARY KEY,
			workspace_id TEXT NOT NULL,
			project_id TEXT,
			entity_type TEXT NOT NULL,
			entity_id TEXT NOT NULL,
			action TEXT NOT NULL,
			metadata_json TEXT NOT NULL DEFAULT '{}',
			created_at TEXT NOT NULL
		)
	`)
	if err != nil {
		t.Fatalf("create activities table: %v", err)
	}

	return db
}
