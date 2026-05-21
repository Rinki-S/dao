package projects

import (
	"database/sql"
	"encoding/json"
	"time"

	"github.com/oklog/ulid/v2"
	"github.com/rinki-s/dao/apps/local-service/internal/modules/activities"
	"github.com/rinki-s/dao/apps/local-service/internal/modules/search"
)

type Repository struct {
	db       *sql.DB
	indexer  search.Indexer
	activity *activities.Repository
}

func NewRepository(db *sql.DB, indexer search.Indexer, activity *activities.Repository) *Repository {
	return &Repository{db: db, indexer: indexer, activity: activity}
}

func (r *Repository) List() ([]Project, error) {
	rows, err := r.db.Query(`
		SELECT
			id, workspace_id, name, description, status, started_at, ended_at, created_at, updated_at, deleted_at, version, sync_status
		FROM projects
		WHERE deleted_at IS NULL
		ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	projects := []Project{}

	for rows.Next() {
		var project Project

		if err := rows.Scan(
			&project.ID,
			&project.WorkspaceID,
			&project.Name,
			&project.Description,
			&project.Status,
			&project.StartedAt,
			&project.EndedAt,
			&project.CreatedAt,
			&project.UpdatedAt,
			&project.DeletedAt,
			&project.Version,
			&project.SyncStatus,
		); err != nil {
			return nil, err
		}

		projects = append(projects, project)
	}

	return projects, rows.Err()
}

func (r *Repository) Create(req CreateProjectRequest) (Project, error) {
	now := time.Now().UTC().Format(time.RFC3339)

	project := Project{
		ID:          ulid.Make().String(),
		WorkspaceID: req.WorkspaceID,
		Name:        req.Name,
		Description: req.Description,
		Status:      "active",
		StartedAt:   nil,
		EndedAt:     nil,
		CreatedAt:   now,
		UpdatedAt:   now,
		DeletedAt:   nil,
		Version:     1,
		SyncStatus:  "local",
	}

	tx, err := r.db.Begin()
	if err != nil {
		return Project{}, err
	}
	defer tx.Rollback()

	_, err = tx.Exec(`
			INSERT INTO projects (
				id, workspace_id, name, description, status, started_at, ended_at, created_at, updated_at, deleted_at, version, sync_status
			)
			VALUES (
				?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
			)
		`,
		project.ID,
		project.WorkspaceID,
		project.Name,
		project.Description,
		project.Status,
		project.StartedAt,
		project.EndedAt,
		project.CreatedAt,
		project.UpdatedAt,
		project.DeletedAt,
		project.Version,
		project.SyncStatus,
	)
	if err != nil {
		return Project{}, err
	}

	projectID := project.ID
	if err := r.indexer.IndexTx(tx, search.IndexEntry{
		EntityType:  "project",
		EntityID:    project.ID,
		WorkspaceID: project.WorkspaceID,
		ProjectID:   &projectID,
		Title:       project.Name,
		Body:        project.Description,
		CreatedAt:   project.CreatedAt,
		UpdatedAt:   project.UpdatedAt,
	}); err != nil {
		return Project{}, err
	}

	metadata, err := json.Marshal(map[string]string{
		"name": project.Name,
	})
	if err != nil {
		return Project{}, err
	}

	if _, err := r.activity.CreateTx(tx, activities.CreateActivityRequest{
		WorkspaceID:  project.WorkspaceID,
		ProjectID:    &projectID,
		EntityType:   "project",
		EntityID:     project.ID,
		Action:       "created",
		MetadataJSON: string(metadata),
	}); err != nil {
		return Project{}, err
	}

	if err := tx.Commit(); err != nil {
		return Project{}, err
	}

	return project, nil
}
