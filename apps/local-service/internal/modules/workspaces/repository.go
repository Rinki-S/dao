package workspaces

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

func (r *Repository) List() ([]Workspace, error) {
	rows, err := r.db.Query(`
		SELECT id, name, description, created_at, updated_at, deleted_at, version, sync_status
		FROM workspaces
		WHERE deleted_at IS NULL
		ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	workspaces := []Workspace{}

	for rows.Next() {
		var workspace Workspace

		if err := rows.Scan(
			&workspace.ID,
			&workspace.Name,
			&workspace.Description,
			&workspace.CreatedAt,
			&workspace.UpdatedAt,
			&workspace.DeletedAt,
			&workspace.Version,
			&workspace.SyncStatus,
		); err != nil {
			return nil, err
		}

		workspaces = append(workspaces, workspace)
	}

	return workspaces, rows.Err()
}

func (r *Repository) Create(req CreateWorkspaceRequest) (Workspace, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	id := ulid.Make().String()

	workspace := Workspace{
		ID:          id,
		Name:        req.Name,
		Description: req.Description,
		CreatedAt:   now,
		UpdatedAt:   now,
		DeletedAt:   nil,
		Version:     1,
		SyncStatus:  "local",
	}

	_, err := r.db.Exec(`
		INSERT INTO workspaces (
			id, name, description, created_at, updated_at, deleted_at, version, sync_status
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`,
		workspace.ID,
		workspace.Name,
		workspace.Description,
		workspace.CreatedAt,
		workspace.UpdatedAt,
		workspace.DeletedAt,
		workspace.Version,
		workspace.SyncStatus,
	)

	if err != nil {
		return Workspace{}, err
	}

	return workspace, nil
}
