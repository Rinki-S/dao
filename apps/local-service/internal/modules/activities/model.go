package activities

type Activity struct {
	ID           string  `json:"id"`
	WorkspaceID  string  `json:"workspaceId"`
	ProjectID    *string `json:"projectId"`
	EntityType   string  `json:"entityType"`
	EntityID     string  `json:"entityId"`
	Action       string  `json:"action"`
	MetadataJSON string  `json:"metadataJson"`
	CreatedAt    string  `json:"createdAt"`
}

type CreateActivityRequest struct {
	WorkspaceID  string
	ProjectID    *string
	EntityType   string
	EntityID     string
	Action       string
	MetadataJSON string
}
