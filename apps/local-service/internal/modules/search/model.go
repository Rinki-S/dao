package search

import "database/sql"

type Result struct {
	EntityType  string  `json:"entityType"`
	EntityID    string  `json:"entityId"`
	WorkspaceID string  `json:"workspaceId"`
	ProjectID   *string `json:"projectId"`
	Title       string  `json:"title"`
	Snippet     string  `json:"snippet"`
}

type IndexEntry struct {
	EntityType  string
	EntityID    string
	WorkspaceID string
	ProjectID   *string
	Title       string
	Body        string
	CreatedAt   string
	UpdatedAt   string
}

type Indexer interface {
	IndexTx(tx *sql.Tx, entry IndexEntry) error
}
