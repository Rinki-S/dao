-- +goose Up
CREATE TABLE notes_new (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    project_id TEXT,
    title TEXT NOT NULL,
    file_path TEXT NOT NULL DEFAULT '',
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

INSERT INTO notes_new (
    id,
    workspace_id,
    project_id,
    title,
    file_path,
    content_type,
    note_type,
    created_at,
    updated_at,
    deleted_at,
    version,
    sync_status
)
SELECT
    id,
    workspace_id,
    project_id,
    title,
    file_path,
    content_type,
    note_type,
    created_at,
    updated_at,
    deleted_at,
    version,
    sync_status
FROM notes;

DROP TABLE notes;
ALTER TABLE notes_new RENAME TO notes;

-- +goose Down
CREATE TABLE notes_old (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    project_id TEXT,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    file_path TEXT NOT NULL DEFAULT '',
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

INSERT INTO notes_old (
    id,
    workspace_id,
    project_id,
    title,
    content,
    file_path,
    content_type,
    note_type,
    created_at,
    updated_at,
    deleted_at,
    version,
    sync_status
)
SELECT
    id,
    workspace_id,
    project_id,
    title,
    '',
    file_path,
    content_type,
    note_type,
    created_at,
    updated_at,
    deleted_at,
    version,
    sync_status
FROM notes;

DROP TABLE notes;
ALTER TABLE notes_old RENAME TO notes;
