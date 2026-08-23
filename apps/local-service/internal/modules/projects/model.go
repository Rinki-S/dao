package projects

import "encoding/json"

type Project struct {
	ID          string  `json:"id"`
	WorkspaceID string  `json:"workspaceId"`
	ParentID    *string `json:"parentId"`
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
	WorkspaceID string  `json:"workspaceId"`
	ParentID    *string `json:"parentId"`
	Name        string  `json:"name"`
	Description string  `json:"description"`
}

type UpdateProjectRequest struct {
	Name        *string          `json:"name"`
	Description *string          `json:"description"`
	ParentID    OptionalParentID `json:"parentId"`
}

// OptionalParentID tells "leave the folder where it is" apart from "move it to
// the workspace root", which a *string cannot: both arrive as nil.
type OptionalParentID struct {
	Set   bool
	Value *string
}

func (o *OptionalParentID) UnmarshalJSON(data []byte) error {
	o.Set = true

	return json.Unmarshal(data, &o.Value)
}

type DeleteProjectRequest struct {
	DeleteNotes bool `json:"deleteNotes"`
}
