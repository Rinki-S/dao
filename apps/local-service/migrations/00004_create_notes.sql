-- +goose Up
CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    project_id TEXT,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    content_type TEXT NOT NULL DEFAULT 'markdown',
    note_type TEXT NOT NULL DEFAULT 'general',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    sync_status TEXT NOT NULL DEFAULT 'local',
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
    FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE INDEX IF NOT EXISTS idx_notes_workspace_id
ON notes(workspace_id);

CREATE INDEX IF NOT EXISTS idx_notes_project_id
ON notes(project_id);

CREATE INDEX IF NOT EXISTS idx_notes_note_type
ON notes(note_type);

-- +goose Down
DROP INDEX IF EXISTS idx_notes_note_type;
DROP INDEX IF EXISTS idx_notes_project_id;
DROP INDEX IF EXISTS idx_notes_workspace_id;
DROP TABLE IF EXISTS notes;
