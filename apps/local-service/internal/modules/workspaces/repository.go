package workspaces

import (
	"database/sql"
	"encoding/json"
	"time"

	"github.com/oklog/ulid/v2"
	"github.com/rinki-s/dao/apps/local-service/internal/files"
	"github.com/rinki-s/dao/apps/local-service/internal/modules/activities"
)

type Repository struct {
	db       *sql.DB
	activity *activities.Repository
}

func NewRepository(db *sql.DB, activity *activities.Repository) *Repository {
	return &Repository{db: db, activity: activity}
}

func (r *Repository) List() ([]Workspace, error) {
	rows, err := r.db.Query(`
		SELECT id, name, description, root_path, created_at, updated_at, deleted_at, version, sync_status
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
			&workspace.RootPath,
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
	rootPath, err := files.WorkspaceFolderPath(req.Name, id)
	if err != nil {
		return Workspace{}, err
	}

	workspace := Workspace{
		ID:          id,
		Name:        req.Name,
		Description: req.Description,
		RootPath:    rootPath,
		CreatedAt:   now,
		UpdatedAt:   now,
		DeletedAt:   nil,
		Version:     1,
		SyncStatus:  "local",
	}

	if err := files.EnsureDir(workspace.RootPath); err != nil {
		return Workspace{}, err
	}

	tx, err := r.db.Begin()
	if err != nil {
		return Workspace{}, err
	}
	defer tx.Rollback()

	_, err = tx.Exec(`
		INSERT INTO workspaces (
			id, name, description, root_path, created_at, updated_at, deleted_at, version, sync_status
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		workspace.ID,
		workspace.Name,
		workspace.Description,
		workspace.RootPath,
		workspace.CreatedAt,
		workspace.UpdatedAt,
		workspace.DeletedAt,
		workspace.Version,
		workspace.SyncStatus,
	)

	if err != nil {
		return Workspace{}, err
	}

	metadata, err := json.Marshal(map[string]string{
		"name": workspace.Name,
	})
	if err != nil {
		return Workspace{}, err
	}

	if _, err := r.activity.CreateTx(tx, activities.CreateActivityRequest{
		WorkspaceID:  workspace.ID,
		ProjectID:    nil,
		EntityType:   "workspace",
		EntityID:     workspace.ID,
		Action:       "created",
		MetadataJSON: string(metadata),
	}); err != nil {
		return Workspace{}, err
	}

	if err := tx.Commit(); err != nil {
		return Workspace{}, err
	}

	return workspace, nil
}
