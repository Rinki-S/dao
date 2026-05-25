package tasks

type Task struct {
	ID          string  `json:"id"`
	WorkspaceID string  `json:"workspaceId"`
	ProjectID   *string `json:"projectId"`
	ParentID    *string `json:"parentId"`
	Title       string  `json:"title"`
	Description string  `json:"description"`
	Status      string  `json:"status"`
	Priority    string  `json:"priority"`
	DueDate     *string `json:"dueDate"`
	CreatedAt   string  `json:"createdAt"`
	UpdatedAt   string  `json:"updatedAt"`
	DeletedAt   *string `json:"deletedAt"`
	Version     int64   `json:"version"`
	SyncStatus  string  `json:"syncStatus"`
}

type CreateTaskRequest struct {
	WorkspaceID string  `json:"workspaceId"`
	ProjectID   *string `json:"projectId"`
	ParentID    *string `json:"parentId"`
	Title       string  `json:"title"`
	Description string  `json:"description"`
	Priority    string  `json:"priority"`
	DueDate     *string `json:"dueDate"`
}

type UpdateTaskStatusRequest struct {
	Status string `json:"status"`
}
