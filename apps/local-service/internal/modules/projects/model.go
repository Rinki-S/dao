package projects

type Project struct {
	ID          string  `json:"id"`
	WorkspaceID string  `json:"workspaceId"`
	Name        string  `json:"name"`
	Description string  `json:"description"`
	FolderPath  string  `json:"folderPath"`
	Status      string  `json:"status"`
	StartedAt   *string `json:"startedAt"`
	EndedAt     *string `json:"endedAt"`
	CreatedAt   string  `json:"createdAt"`
	UpdatedAt   string  `json:"updatedAt"`
	DeletedAt   *string `json:"deletedAt"`
	Version     int64   `json:"version"`
	SyncStatus  string  `json:"syncStatus"`
}

type CreateProjectRequest struct {
	WorkspaceID string `json:"workspaceId"`
	Name        string `json:"name"`
	Description string `json:"description"`
}
