package projects

import (
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"github.com/oklog/ulid/v2"
	"github.com/rinki-s/dao/apps/local-service/internal/files"
	"github.com/rinki-s/dao/apps/local-service/internal/modules/activities"
	"github.com/rinki-s/dao/apps/local-service/internal/modules/search"
)

// ErrParentNotFound distinguishes an unknown parent folder from an unknown
// folder, which both surface as sql.ErrNoRows otherwise.
var ErrParentNotFound = errors.New("parent project not found")

type Repository struct {
	db       *sql.DB
	indexer  search.Indexer
	activity *activities.Repository
}

func NewRepository(db *sql.DB, indexer search.Indexer, activity *activities.Repository) *Repository {
	return &Repository{db: db, indexer: indexer, activity: activity}
}

const projectSelectColumns = `
	id, workspace_id, parent_id, name, description, folder_path, status, started_at, ended_at, created_at, updated_at, deleted_at, version, sync_status
`

func (r *Repository) List() ([]Project, error) {
	rows, err := r.db.Query(`
		SELECT
			` + projectSelectColumns + `
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
		project, err := scanProject(rows)
		if err != nil {
			return nil, err
		}

		projects = append(projects, project)
	}

	return projects, rows.Err()
}

func (r *Repository) Create(req CreateProjectRequest) (Project, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	id := ulid.Make().String()

	// A folder nests under its parent on disk, so the parent's own path is the
	// root to build from. Without a parent that is the workspace root.
	parentPath, err := r.folderParentPath(req.WorkspaceID, req.ParentID)
	if err != nil {
		return Project{}, err
	}

	folderPath := files.ProjectFolderPath(parentPath, req.Name, id)

	project := Project{
		ID:          id,
		WorkspaceID: req.WorkspaceID,
		ParentID:    req.ParentID,
		Name:        req.Name,
		Description: req.Description,
		FolderPath:  folderPath,
		Status:      "active",
		StartedAt:   nil,
		EndedAt:     nil,
		CreatedAt:   now,
		UpdatedAt:   now,
		DeletedAt:   nil,
		Version:     1,
		SyncStatus:  "local",
	}

	if err := files.EnsureDir(project.FolderPath); err != nil {
		return Project{}, err
	}

	tx, err := r.db.Begin()
	if err != nil {
		return Project{}, err
	}
	defer tx.Rollback()

	_, err = tx.Exec(`
			INSERT INTO projects (
				id, workspace_id, parent_id, name, description, folder_path, status, started_at, ended_at, created_at, updated_at, deleted_at, version, sync_status
			)
			VALUES (
				?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
			)
		`,
		project.ID,
		project.WorkspaceID,
		project.ParentID,
		project.Name,
		project.Description,
		project.FolderPath,
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

func (r *Repository) Update(id string, req UpdateProjectRequest) (Project, error) {
	now := time.Now().UTC().Format(time.RFC3339)

	project, err := scanProject(r.db.QueryRow(`
		SELECT
			`+projectSelectColumns+`
		FROM projects
		WHERE id = ? AND deleted_at IS NULL
	`, id))
	if err != nil {
		return Project{}, err
	}

	if req.Name != nil {
		project.Name = *req.Name
	}
	if req.Description != nil {
		project.Description = *req.Description
	}

	tx, err := r.db.Begin()
	if err != nil {
		return Project{}, err
	}
	defer tx.Rollback()

	result, err := tx.Exec(`
		UPDATE projects
		SET name = ?, description = ?, updated_at = ?, version = version + 1, sync_status = 'local'
		WHERE id = ? AND deleted_at IS NULL
	`, project.Name, project.Description, now, id)
	if err != nil {
		return Project{}, err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return Project{}, err
	}
	if rowsAffected == 0 {
		return Project{}, sql.ErrNoRows
	}

	project.UpdatedAt = now
	project.Version += 1
	project.SyncStatus = "local"

	projectID := project.ID
	if err := r.indexer.ReplaceTx(tx, search.IndexEntry{
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

	if err := tx.Commit(); err != nil {
		return Project{}, err
	}

	return project, nil
}

func (r *Repository) Delete(id string, req DeleteProjectRequest) error {
	now := time.Now().UTC().Format(time.RFC3339)

	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	result, err := tx.Exec(`
		UPDATE projects
		SET deleted_at = ?, updated_at = ?, version = version + 1, sync_status = 'local'
		WHERE id = ? AND deleted_at IS NULL
	`, now, now, id)
	if err != nil {
		return err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return sql.ErrNoRows
	}

	if req.DeleteNotes {
		if _, err := tx.Exec(`
			UPDATE notes
			SET deleted_at = ?, updated_at = ?, version = version + 1, sync_status = 'local'
			WHERE project_id = ? AND deleted_at IS NULL
		`, now, now, id); err != nil {
			return err
		}
		if _, err := tx.Exec(`
			DELETE FROM search_index
			WHERE entity_type = 'note' AND project_id = ?
		`, id); err != nil {
			return err
		}
	} else {
		if _, err := tx.Exec(`
			UPDATE notes
			SET project_id = NULL, updated_at = ?, version = version + 1, sync_status = 'local'
			WHERE project_id = ? AND deleted_at IS NULL
		`, now, id); err != nil {
			return err
		}
		if _, err := tx.Exec(`
			UPDATE search_index
			SET project_id = NULL
			WHERE entity_type = 'note' AND project_id = ?
		`, id); err != nil {
			return err
		}
	}

	if err := r.indexer.DeleteTx(tx, "project", id); err != nil {
		return err
	}

	return tx.Commit()
}

// folderParentPath resolves where a folder's directory lives: inside its
// parent folder, or at the workspace root when it has none.
func (r *Repository) folderParentPath(workspaceID string, parentID *string) (string, error) {
	if parentID != nil {
		var folderPath string
		if err := r.db.QueryRow(`
			SELECT folder_path
			FROM projects
			WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL
		`, *parentID, workspaceID).Scan(&folderPath); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return "", ErrParentNotFound
			}

			return "", err
		}

		return folderPath, nil
	}

	var rootPath string
	if err := r.db.QueryRow(`
		SELECT root_path
		FROM workspaces
		WHERE id = ? AND deleted_at IS NULL
	`, workspaceID).Scan(&rootPath); err != nil {
		return "", err
	}

	return rootPath, nil
}

type projectScanner interface {
	Scan(dest ...any) error
}

func scanProject(scanner projectScanner) (Project, error) {
	var project Project

	if err := scanner.Scan(
		&project.ID,
		&project.WorkspaceID,
		&project.ParentID,
		&project.Name,
		&project.Description,
		&project.FolderPath,
		&project.Status,
		&project.StartedAt,
		&project.EndedAt,
		&project.CreatedAt,
		&project.UpdatedAt,
		&project.DeletedAt,
		&project.Version,
		&project.SyncStatus,
	); err != nil {
		return Project{}, err
	}

	return project, nil
}
