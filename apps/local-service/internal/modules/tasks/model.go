package tasks

// Document is a workspace's whole task list: one Markdown file, edited as
// text. There is no per-task record — a task is a checkbox line, a subtask is
// an indented one, and both live only in the file.
type Document struct {
	WorkspaceID string `json:"workspaceId"`
	Content     string `json:"content"`
	FilePath    string `json:"filePath"`
	UpdatedAt   string `json:"updatedAt"`
}

type UpdateDocumentRequest struct {
	Content string `json:"content"`
}
