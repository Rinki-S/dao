-- +goose Up
ALTER TABLE tasks
ADD COLUMN parent_id TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_parent_id
ON tasks(parent_id);

-- +goose Down
DROP INDEX IF EXISTS idx_tasks_parent_id;

