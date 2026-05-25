package tasks

import (
	"database/sql"
	"encoding/json"
	"errors"
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

func (r *Repository) UpdateStatus(id string, req UpdateTaskStatusRequest) (Task, error) {
	now := time.Now().UTC().Format(time.RFC3339)

	tx, err := r.db.Begin()
	if err != nil {
		return Task{}, err
	}
	defer tx.Rollback()

	result, err := tx.Exec(`
		UPDATE tasks
		SET status = ?, updated_at = ?, version = version + 1, sync_status = 'local'
		WHERE id = ? AND deleted_at IS NULL
	`, req.Status, now, id)
	if err != nil {
		return Task{}, err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return Task{}, err
	}

	if rowsAffected == 0 {
		return Task{}, sql.ErrNoRows
	}

	task, err := scanTaskRow(tx.QueryRow(`
		SELECT
			id, workspace_id, project_id, title, description, status, priority, due_date,
			created_at, updated_at, deleted_at, version, sync_status
		FROM tasks
		WHERE id = ?
	`, id))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Task{}, err
		}

		return Task{}, err
	}

	if err := tx.Commit(); err != nil {
		return Task{}, err
	}

	return task, nil
}

type taskScanner interface {
	Scan(dest ...any) error
}

func scanTaskRow(row taskScanner) (Task, error) {
	var task Task

	if err := row.Scan(
		&task.ID,
		&task.WorkspaceID,
		&task.ProjectID,
		&task.Title,
		&task.Description,
		&task.Status,
		&task.Priority,
		&task.DueDate,
		&task.CreatedAt,
		&task.UpdatedAt,
		&task.DeletedAt,
		&task.Version,
		&task.SyncStatus,
	); err != nil {
		return Task{}, err
	}

	return task, nil
}

func NewRepository(db *sql.DB, indexer search.Indexer, activity *activities.Repository) *Repository {
	return &Repository{db: db, indexer: indexer, activity: activity}
}

func (r *Repository) List() ([]Task, error) {
	rows, err := r.db.Query(`
		SELECT
			id, workspace_id, project_id, title, description, status, priority, due_date,
			created_at, updated_at, deleted_at, version, sync_status
		FROM tasks
		WHERE deleted_at IS NULL
		ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	tasks := []Task{}

	for rows.Next() {
		var task Task

		if err := rows.Scan(
			&task.ID,
			&task.WorkspaceID,
			&task.ProjectID,
			&task.Title,
			&task.Description,
			&task.Status,
			&task.Priority,
			&task.DueDate,
			&task.CreatedAt,
			&task.UpdatedAt,
			&task.DeletedAt,
			&task.Version,
			&task.SyncStatus,
		); err != nil {
			return nil, err
		}

		tasks = append(tasks, task)
	}

	return tasks, rows.Err()
}

func (r *Repository) Create(req CreateTaskRequest) (Task, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	priority := req.Priority
	if priority == "" {
		priority = "medium"
	}

	task := Task{
		ID:          ulid.Make().String(),
		WorkspaceID: req.WorkspaceID,
		ProjectID:   req.ProjectID,
		Title:       req.Title,
		Description: req.Description,
		Status:      "todo",
		Priority:    priority,
		DueDate:     req.DueDate,
		CreatedAt:   now,
		UpdatedAt:   now,
		DeletedAt:   nil,
		Version:     1,
		SyncStatus:  "local",
	}

	tx, err := r.db.Begin()
	if err != nil {
		return Task{}, err
	}
	defer tx.Rollback()

	_, err = tx.Exec(`
		INSERT INTO tasks (
			id, workspace_id, project_id, title, description, status, priority, due_date,
			created_at, updated_at, deleted_at, version, sync_status
		)
		VALUES (
			?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
		)
	`,
		task.ID,
		task.WorkspaceID,
		task.ProjectID,
		task.Title,
		task.Description,
		task.Status,
		task.Priority,
		task.DueDate,
		task.CreatedAt,
		task.UpdatedAt,
		task.DeletedAt,
		task.Version,
		task.SyncStatus,
	)
	if err != nil {
		return Task{}, err
	}

	if err := r.indexer.IndexTx(tx, search.IndexEntry{
		EntityType:  "task",
		EntityID:    task.ID,
		WorkspaceID: task.WorkspaceID,
		ProjectID:   task.ProjectID,
		Title:       task.Title,
		Body:        task.Description,
		CreatedAt:   task.CreatedAt,
		UpdatedAt:   task.UpdatedAt,
	}); err != nil {
		return Task{}, err
	}

	metadata, err := json.Marshal(map[string]string{
		"title":    task.Title,
		"priority": task.Priority,
	})
	if err != nil {
		return Task{}, err
	}

	if _, err := r.activity.CreateTx(tx, activities.CreateActivityRequest{
		WorkspaceID:  task.WorkspaceID,
		ProjectID:    task.ProjectID,
		EntityType:   "task",
		EntityID:     task.ID,
		Action:       "created",
		MetadataJSON: string(metadata),
	}); err != nil {
		return Task{}, err
	}

	if err := tx.Commit(); err != nil {
		return Task{}, err
	}

	return task, nil
}
