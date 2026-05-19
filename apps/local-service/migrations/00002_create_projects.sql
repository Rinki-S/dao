-- +goose Up
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    started_at TEXT,
    ended_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    sync_status TEXT NOT NULL DEFAULT 'local',
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE INDEX IF NOT EXISTS idx_projects_workspace_id
ON projects(workspace_id);

CREATE INDEX IF NOT EXISTS idx_projects_status
ON projects(status);

-- +goose Down
DROP INDEX IF EXISTS idx_projects_status;
DROP INDEX IF EXISTS idx_projects_workspace_id;
DROP TABLE IF EXISTS projects;
