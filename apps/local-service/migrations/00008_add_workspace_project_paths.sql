-- +goose Up
ALTER TABLE workspaces
ADD COLUMN root_path TEXT NOT NULL DEFAULT '';

ALTER TABLE projects
ADD COLUMN folder_path TEXT NOT NULL DEFAULT '';

-- +goose Down

