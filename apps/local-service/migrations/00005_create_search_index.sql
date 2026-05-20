-- +goose Up
CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
    entity_type UNINDEXED,
    entity_id UNINDEXED,
    workspace_id UNINDEXED,
    project_id UNINDEXED,
    title,
    body,
    created_at UNINDEXED,
    updated_at UNINDEXED
);

-- +goose Down
DROP TABLE IF EXISTS search_index;
