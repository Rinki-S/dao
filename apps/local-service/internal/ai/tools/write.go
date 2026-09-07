package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/rinki-s/dao/apps/local-service/internal/ai/agent"
	"github.com/rinki-s/dao/apps/local-service/internal/ai/llm"
)

// maxProposedTitleRunes bounds a title the model made up.
//
// A title is a filename as well as a heading here, and a model that answers the
// "title" field with a paragraph would be proposing a note nobody can find
// again. Refused rather than trimmed: a title cut in half is a title that says
// something its author did not mean.
const maxProposedTitleRunes = 120

// The sentence every writing tool ends with.
//
// Repeated in each description rather than assumed. A model reaching for a tool
// reads that tool's description and nothing else, and one that believes it has
// already made a change will say so in the same breath — which is a lie told to
// the person the confirmation exists to protect.
const doesNotWrite = " The change is NOT made: it is shown to the person whose workspace " +
	"this is, and they decide. Do not say you have done it."

type createNote struct{ workspace Workspace }

func (t *createNote) Definition() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name: "create_note",
		Description: "Propose a new note in this workspace, with a title and its full text. " +
			"Search first: adding to a note that already covers the subject is usually better " +
			"than starting a second one." + doesNotWrite,
		Schema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"title": {
					"type": "string",
					"description": "What to call the note. Short, and specific enough to find again."
				},
				"content": {
					"type": "string",
					"description": "The note's full text, in Markdown. Write the whole thing — there is no note yet to add to."
				}
			},
			"required": ["title", "content"]
		}`),
	}
}

// Run records a note that does not exist yet.
//
// There is nothing to read first and nothing to compare against, so the checks
// are only about the two pieces of text: a note with no title cannot be found
// again, and a note with no content is a file somebody has to go and delete.
func (t *createNote) Run(_ context.Context, call agent.Call) (string, error) {
	var arguments struct {
		Title   string `json:"title"`
		Content string `json:"content"`
	}
	if err := json.Unmarshal(call.Input, &arguments); err != nil {
		return "", fmt.Errorf("could not read the arguments: %v", err)
	}

	title, err := checkTitle(arguments.Title)
	if err != nil {
		return "", err
	}

	if strings.TrimSpace(arguments.Content) == "" {
		return "", fmt.Errorf(
			"content is required: proposing an empty note asks somebody to agree to a file " +
				"with nothing in it. Write the note, then propose it",
		)
	}

	// No target and no expectation. Nothing exists yet, so there is nothing to
	// point at and nothing that could have moved on underneath it — the only one
	// of the five changes that cannot go stale.
	if err := t.workspace.Propose(Proposed{
		ToolCallID: call.ID,
		Kind:       KindCreateNote,
		Title:      title,
		After:      arguments.Content,
	}); err != nil {
		return "", fmt.Errorf("the note could not be prepared: %v", err)
	}

	return "", agent.ErrAwaitingApproval
}

type renameNote struct{ workspace Workspace }

func (t *renameNote) Definition() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name: "rename_note",
		Description: "Propose a new title for one note. This changes what the note is called " +
			"and nothing inside it — to change its text, use edit_note." + doesNotWrite,
		Schema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"id": {
					"type": "string",
					"description": "The note's id, exactly as search_notes or read_note gave it."
				},
				"title": {
					"type": "string",
					"description": "What to call it instead. Short, and specific enough to find again."
				}
			},
			"required": ["id", "title"]
		}`),
	}
}

// Run records a new title for a note.
//
// The two texts are the titles, not the note. That is the honest reading of
// what Before and After are for — the thing being changed — and it means the
// comparison shown to a person is of the two names, which is the whole of what
// this change does. Putting the note's body in there would draw a picture of
// something this tool does not touch.
func (t *renameNote) Run(_ context.Context, call agent.Call) (string, error) {
	var arguments struct {
		ID    string `json:"id"`
		Title string `json:"title"`
	}
	if err := json.Unmarshal(call.Input, &arguments); err != nil {
		return "", fmt.Errorf("could not read the arguments: %v", err)
	}

	id := strings.TrimSpace(arguments.ID)
	if id == "" {
		return "", fmt.Errorf("id is required and cannot be empty")
	}

	title, err := checkTitle(arguments.Title)
	if err != nil {
		return "", err
	}

	note, err := t.workspace.ReadNote(id)
	if err != nil {
		return "", fmt.Errorf(
			"no note with id %q in this workspace. Use search_notes to find the right id", id,
		)
	}

	if title == note.Title {
		return "", fmt.Errorf("%q is already called that, so there is nothing to change", note.Title)
	}

	if err := t.workspace.Propose(Proposed{
		ToolCallID:        call.ID,
		Kind:              KindRenameNote,
		TargetID:          id,
		Before:            note.Title,
		After:             title,
		ExpectedUpdatedAt: note.UpdatedAt,
	}); err != nil {
		return "", fmt.Errorf("the rename could not be prepared: %v", err)
	}

	return "", agent.ErrAwaitingApproval
}

type deleteNote struct{ workspace Workspace }

func (t *deleteNote) Definition() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name: "delete_note",
		Description: "Propose deleting one note. Read it first: the person will be shown what " +
			"is in it, and asking to delete a note you have not read is asking them to check " +
			"your work for you." + doesNotWrite,
		Schema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"id": {
					"type": "string",
					"description": "The note's id, exactly as search_notes or read_note gave it."
				}
			},
			"required": ["id"]
		}`),
	}
}

// Run records a note the model thinks should go.
//
// The note's whole text becomes Before, with nothing after it. Not bookkeeping:
// the comparison drawn from that pair is every line marked as going, which is
// exactly what somebody about to agree to this needs to see. A card that said
// only "delete Ports" would be asking them to remember what was in it.
func (t *deleteNote) Run(_ context.Context, call agent.Call) (string, error) {
	var arguments struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(call.Input, &arguments); err != nil {
		return "", fmt.Errorf("could not read the arguments: %v", err)
	}

	id := strings.TrimSpace(arguments.ID)
	if id == "" {
		return "", fmt.Errorf("id is required and cannot be empty")
	}

	note, err := t.workspace.ReadNote(id)
	if err != nil {
		return "", fmt.Errorf(
			"no note with id %q in this workspace. Use search_notes to find the right id", id,
		)
	}

	if err := t.workspace.Propose(Proposed{
		ToolCallID:        call.ID,
		Kind:              KindDeleteNote,
		TargetID:          id,
		Before:            note.Content,
		ExpectedUpdatedAt: note.UpdatedAt,
	}); err != nil {
		return "", fmt.Errorf("the deletion could not be prepared: %v", err)
	}

	return "", agent.ErrAwaitingApproval
}

// checkTitle is the rule for a title the model made up, wherever one arrives.
//
// Shared by creating and renaming because a title is a filename in both, and a
// rule enforced in one of the two places is a rule with a way around it.
func checkTitle(proposed string) (string, error) {
	title := strings.TrimSpace(proposed)

	if title == "" {
		return "", fmt.Errorf("title is required: a note with no title cannot be found again")
	}
	if len([]rune(title)) > maxProposedTitleRunes {
		return "", fmt.Errorf(
			"that title is %d characters, and a title is also this note's filename. "+
				"Give it a short one and put the rest in the content",
			len([]rune(title)),
		)
	}
	// A title with a line break in it is a title that would be a filename with a
	// line break in it. Said plainly rather than quietly flattened, because a
	// model that meant two lines meant a heading and a first paragraph.
	if strings.ContainsAny(title, "\r\n") {
		return "", fmt.Errorf(
			"a title cannot span lines. Use the first line as the title and put the rest " +
				"in the content",
		)
	}

	return title, nil
}

type editTasks struct{ workspace Workspace }

func (t *editTasks) Definition() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name: "edit_tasks",
		Description: "Propose a change to this workspace's task list, by replacing an exact " +
			"piece of its text. Read it first with read_tasks and copy old_text from what you " +
			"read, character for character. A checked box means done." + doesNotWrite,
		Schema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"old_text": {
					"type": "string",
					"description": "The exact text to replace, copied from the task list. It must appear exactly once — include the surrounding lines if a shorter piece would match in more than one place."
				},
				"new_text": {
					"type": "string",
					"description": "What to put there instead. Use an empty string to delete the old text. To add a task, use the line you want to add it after as old_text and repeat that line followed by the new one as new_text."
				}
			},
			"required": ["old_text", "new_text"]
		}`),
	}
}

// Run works out a change to the task list and records it.
//
// The same shape as editing a note, and deliberately so: a targeted replacement
// that must match exactly once, refused with the actual text when it does not.
// What differs is that there is one task list per workspace, so nothing has to
// be named — and that a list is mostly short similar lines, which is exactly the
// text a single-line old_text matches twice.
func (t *editTasks) Run(_ context.Context, call agent.Call) (string, error) {
	var arguments struct {
		OldText string `json:"old_text"`
		NewText string `json:"new_text"`
	}
	if err := json.Unmarshal(call.Input, &arguments); err != nil {
		return "", fmt.Errorf("could not read the arguments: %v", err)
	}

	if arguments.OldText == "" {
		return "", fmt.Errorf(
			"old_text is required: it is the exact text to replace, copied from the task list. " +
				"To add a task, use the line you want it after as old_text and repeat that line " +
				"followed by the new one as new_text",
		)
	}
	if arguments.OldText == arguments.NewText {
		return "", fmt.Errorf("old_text and new_text are the same, so there is nothing to change")
	}

	list, err := t.workspace.ReadTasks()
	if err != nil {
		return "", fmt.Errorf("the task list could not be read: %v", err)
	}

	after, err := document{
		name:    "the task list",
		content: list.Content,
		reread:  "read_tasks",
	}.replaceOnce(arguments.OldText, arguments.NewText)
	if err != nil {
		return "", err
	}

	// Titled here rather than by whoever records it, because there is no row to
	// read a name off: the task list is one document per workspace and this is
	// what a person should see it called when they are asked.
	if err := t.workspace.Propose(Proposed{
		ToolCallID:        call.ID,
		Kind:              KindEditTasks,
		Title:             "Task list",
		Before:            list.Content,
		After:             after,
		ExpectedUpdatedAt: list.UpdatedAt,
	}); err != nil {
		return "", fmt.Errorf("the change could not be prepared: %v", err)
	}

	return "", agent.ErrAwaitingApproval
}
