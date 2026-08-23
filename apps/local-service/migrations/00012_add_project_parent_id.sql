-- +goose Up
ALTER TABLE projects
ADD COLUMN parent_id TEXT;

CREATE INDEX IF NOT EXISTS idx_projects_parent_id
ON projects(parent_id);

-- +goose Down
DROP INDEX IF EXISTS idx_projects_parent_id;
