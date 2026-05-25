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

var ErrInvalidParentTask = errors.New("invalid parent task")

func (r *Repository) UpdateStatus(id string, req UpdateTaskStatusRequest) (Task, error) {
	now := time.Now().UTC().Format(time.RFC3339)

	tx, err := r.db.Begin()
	if err != nil {
		return Task{}, err
	}
	defer tx.Rollback()

	task, err := scanTaskRow(tx.QueryRow(`
		SELECT
			id, workspace_id, project_id, parent_id, title, description, status, priority, due_date,
			created_at, updated_at, deleted_at, version, sync_status
		FROM tasks
		WHERE id = ? AND deleted_at IS NULL
	`, id))
	if err != nil {
		return Task{}, err
	}

	if task.ParentID == nil {
		if err := r.updateParentStatusTx(tx, task.ID, req.Status, now); err != nil {
			return Task{}, err
		}
	} else {
		if err := r.updateSingleTaskStatusTx(tx, task.ID, req.Status, now); err != nil {
			return Task{}, err
		}

		if err := r.recalculateParentStatusTx(tx, *task.ParentID, now); err != nil {
			return Task{}, err
		}
	}

	updatedTask, err := scanTaskRow(tx.QueryRow(`
		SELECT
			id, workspace_id, project_id, parent_id, title, description, status, priority, due_date,
			created_at, updated_at, deleted_at, version, sync_status
		FROM tasks
		WHERE id = ?
	`, id))
	if err != nil {
		return Task{}, err
	}

	if err := tx.Commit(); err != nil {
		return Task{}, err
	}

	return updatedTask, nil
}

func (r *Repository) updateParentStatusTx(tx *sql.Tx, id string, status string, now string) error {
	childCount, err := r.countChildrenTx(tx, id)
	if err != nil {
		return err
	}

	if childCount == 0 {
		return r.updateSingleTaskStatusTx(tx, id, status, now)
	}

	childStatus := "todo"
	parentStatus := "todo"
	if status == "done" {
		childStatus = "done"
		parentStatus = "done"
	}

	if err := r.updateChildrenStatusTx(tx, id, childStatus, now); err != nil {
		return err
	}

	return r.updateSingleTaskStatusTx(tx, id, parentStatus, now)
}

func (r *Repository) updateSingleTaskStatusTx(tx *sql.Tx, id string, status string, now string) error {
	result, err := tx.Exec(`
		UPDATE tasks
		SET status = ?, updated_at = ?, version = version + 1, sync_status = 'local'
		WHERE id = ? AND deleted_at IS NULL
	`, status, now, id)
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

	return nil
}

func (r *Repository) updateChildrenStatusTx(tx *sql.Tx, parentID string, status string, now string) error {
	_, err := tx.Exec(`
		UPDATE tasks
		SET status = ?, updated_at = ?, version = version + 1, sync_status = 'local'
		WHERE parent_id = ? AND deleted_at IS NULL
	`, status, now, parentID)

	return err
}

func (r *Repository) recalculateParentStatusTx(tx *sql.Tx, parentID string, now string) error {
	var totalCount int
	var doneCount int

	if err := tx.QueryRow(`
		SELECT COUNT(*), COALESCE(SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END), 0)
		FROM tasks
		WHERE parent_id = ? AND deleted_at IS NULL
	`, parentID).Scan(&totalCount, &doneCount); err != nil {
		return err
	}

	if totalCount == 0 {
		return nil
	}

	nextStatus := "doing"
	if doneCount == 0 {
		nextStatus = "todo"
	} else if doneCount == totalCount {
		nextStatus = "done"
	}

	return r.updateSingleTaskStatusTx(tx, parentID, nextStatus, now)
}

func (r *Repository) countChildrenTx(tx *sql.Tx, parentID string) (int, error) {
	var count int

	err := tx.QueryRow(`
		SELECT COUNT(*)
		FROM tasks
		WHERE parent_id = ? AND deleted_at IS NULL
	`, parentID).Scan(&count)

	return count, err
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
		&task.ParentID,
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
			id, workspace_id, project_id, parent_id, title, description, status, priority, due_date,
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
			&task.ParentID,
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
		ParentID:    req.ParentID,
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

	if task.ParentID != nil {
		parent, err := scanTaskRow(tx.QueryRow(`
			SELECT
				id, workspace_id, project_id, parent_id, title, description, status, priority, due_date,
				created_at, updated_at, deleted_at, version, sync_status
			FROM tasks
			WHERE id = ? AND deleted_at IS NULL
		`, *task.ParentID))
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return Task{}, ErrInvalidParentTask
			}

			return Task{}, err
		}

		if parent.WorkspaceID != task.WorkspaceID || parent.ParentID != nil {
			return Task{}, ErrInvalidParentTask
		}

		if task.ProjectID == nil {
			task.ProjectID = parent.ProjectID
		}
	}

	_, err = tx.Exec(`
		INSERT INTO tasks (
			id, workspace_id, project_id, parent_id, title, description, status, priority, due_date,
			created_at, updated_at, deleted_at, version, sync_status
		)
		VALUES (
			?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
		)
	`,
		task.ID,
		task.WorkspaceID,
		task.ProjectID,
		task.ParentID,
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

	if task.ParentID != nil {
		if err := r.recalculateParentStatusTx(tx, *task.ParentID, now); err != nil {
			return Task{}, err
		}
	}

	if err := tx.Commit(); err != nil {
		return Task{}, err
	}

	return task, nil
}
