-- +goose Up
ALTER TABLE notes
ADD COLUMN file_path TEXT NOT NULL DEFAULT '';

-- +goose Down
-- SQLite cannot drop columns without rebuilding the table.
