package activities

import (
	"database/sql"
	"time"

	"github.com/oklog/ulid/v2"
)

type Repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) List() ([]Activity, error) {
	rows, err := r.db.Query(`
		SELECT id, workspace_id, project_id, entity_type, entity_id, action, metadata_json, created_at
		FROM activities
		ORDER BY created_at DESC, id DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	activities := []Activity{}

	for rows.Next() {
		var activity Activity

		if err := rows.Scan(
			&activity.ID,
			&activity.WorkspaceID,
			&activity.ProjectID,
			&activity.EntityType,
			&activity.EntityID,
			&activity.Action,
			&activity.MetadataJSON,
			&activity.CreatedAt,
		); err != nil {
			return nil, err
		}

		activities = append(activities, activity)
	}

	return activities, rows.Err()
}

func (r *Repository) CreateTx(tx *sql.Tx, req CreateActivityRequest) (Activity, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	metadataJSON := req.MetadataJSON
	if metadataJSON == "" {
		metadataJSON = "{}"
	}

	activity := Activity{
		ID:           ulid.Make().String(),
		WorkspaceID:  req.WorkspaceID,
		ProjectID:    req.ProjectID,
		EntityType:   req.EntityType,
		EntityID:     req.EntityID,
		Action:       req.Action,
		MetadataJSON: metadataJSON,
		CreatedAt:    now,
	}

	_, err := tx.Exec(`
		INSERT INTO activities (
			id, workspace_id, project_id, entity_type, entity_id, action, metadata_json, created_at
		)
		VALUES (
			?, ?, ?, ?, ?, ?, ?, ?
		)
	`,
		activity.ID,
		activity.WorkspaceID,
		activity.ProjectID,
		activity.EntityType,
		activity.EntityID,
		activity.Action,
		activity.MetadataJSON,
		activity.CreatedAt,
	)
	if err != nil {
		return Activity{}, err
	}

	return activity, nil
}
