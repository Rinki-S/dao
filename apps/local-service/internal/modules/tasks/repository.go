package tasks

import (
	"database/sql"
	"time"

	"github.com/oklog/ulid/v2"
	"github.com/rinki-s/dao/apps/local-service/internal/modules/search"
)

type Repository struct {
	db      *sql.DB
	indexer search.Indexer
}

func NewRepository(db *sql.DB, indexer search.Indexer) *Repository {
	return &Repository{db: db, indexer: indexer}
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

	if err := tx.Commit(); err != nil {
		return Task{}, err
	}

	return task, nil
}
