package projects

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

	_, err := r.db.Exec(`
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

	return project, nil
}
