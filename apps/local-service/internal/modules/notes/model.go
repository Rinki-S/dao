package notes

import "encoding/json"

type Note struct {
	ID          string  `json:"id"`
	WorkspaceID string  `json:"workspaceId"`
	ProjectID   *string `json:"projectId"`
	Title       string  `json:"title"`
	Content     string  `json:"content"`
	FilePath    string  `json:"filePath"`
	ContentType string  `json:"contentType"`
	NoteType    string  `json:"noteType"`
	CreatedAt   string  `json:"createdAt"`
	UpdatedAt   string  `json:"updatedAt"`
	DeletedAt   *string `json:"deletedAt"`
	Version     int64   `json:"version"`
	SyncStatus  string  `json:"syncStatus"`
}

type CreateNoteRequest struct {
	WorkspaceID string  `json:"workspaceId"`
	ProjectID   *string `json:"projectId"`
	Title       string  `json:"title"`
	Content     string  `json:"content"`
	ContentType string  `json:"contentType"`
	NoteType    string  `json:"noteType"`
}

type UpdateNoteContentRequest struct {
	Content string `json:"content"`
}

type UpdateNoteRequest struct {
	Title     *string           `json:"title"`
	NoteType  *string           `json:"noteType"`
	ProjectID OptionalProjectID `json:"projectId"`
}

// OptionalProjectID tells "leave the folder alone" apart from "move to the
// workspace root", which a *string cannot: both arrive as nil.
type OptionalProjectID struct {
	Set   bool
	Value *string
}

func (o *OptionalProjectID) UnmarshalJSON(data []byte) error {
	o.Set = true

	return json.Unmarshal(data, &o.Value)
}
