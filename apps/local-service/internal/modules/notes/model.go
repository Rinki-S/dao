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

	// ExpectedUpdatedAt is what the note said when the editor last read it.
	//
	// The file is not the editor's alone — a person can change it in Finder
	// while a window is open on it, and without this the next autosave writes
	// over what they did from a copy read before the change. Sending what it
	// believes is true is how a writer asks whether it still is.
	//
	// Empty means "write regardless", which is what the caller sends after
	// being shown a conflict and choosing to keep its own version.
	ExpectedUpdatedAt string `json:"expectedUpdatedAt"`
}

// Conflict is what a refused save carries back: the note as the app now knows
// it, and the text that is actually on disk.
//
// Both, because the editor has to offer a choice, and offering one means
// showing what the other option contains — asking somebody to decide between
// their own work and something they cannot see is not a choice.
type Conflict struct {
	Note      Note   `json:"note"`
	OnDisk    string `json:"onDisk"`
	UpdatedAt string `json:"updatedAt"`
}

func (c *Conflict) Error() string {
	return "the file changed since it was read"
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
