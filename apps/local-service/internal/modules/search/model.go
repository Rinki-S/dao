package search

type Result struct {
	EntityType  string  `json:"entityType"`
	EntityID    string  `json:"entityId"`
	WorkspaceID string  `json:"workspaceId"`
	ProjectID   *string `json:"projectId"`
	Title       string  `json:"title"`
	Snippet     string  `json:"snippet"`
}
