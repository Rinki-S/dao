-- +goose Up
CREATE TABLE IF NOT EXISTS activities (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    project_id TEXT,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
    FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE INDEX IF NOT EXISTS idx_activities_workspace_id
ON activities(workspace_id);

CREATE INDEX IF NOT EXISTS idx_activities_project_id
ON activities(project_id);

CREATE INDEX IF NOT EXISTS idx_activities_entity
ON activities(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_activities_created_at
ON activities(created_at);

-- +goose Down
DROP INDEX IF EXISTS idx_activities_created_at;
DROP INDEX IF EXISTS idx_activities_entity;
DROP INDEX IF EXISTS idx_activities_project_id;
DROP INDEX IF EXISTS idx_activities_workspace_id;
DROP TABLE IF EXISTS activities;
