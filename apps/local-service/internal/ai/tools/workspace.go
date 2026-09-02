// Package tools is what a model is allowed to do inside one workspace.
//
// Every tool here reads. Nothing writes, moves or deletes, and that is not a
// stage on the way to something — a tool that changes the user's files needs a
// human to agree to the change first, which is a different shape from anything
// below. The summary run already has that shape, in ai/harness: it produces
// something and waits to be told to keep it.
//
// The workspace is bound when the tools are built and the model has no argument
// with which to name a different one. This is the security property the package
// exists to have: no prompt, however written, reaches a workspace the request
// was not already for, because there is nowhere to put the other workspace's
// name.
package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/rinki-s/dao/apps/local-service/internal/ai/agent"
	"github.com/rinki-s/dao/apps/local-service/internal/ai/llm"
)

// NoteMatch is one search hit.
type NoteMatch struct {
	ID      string
	Title   string
	Snippet string
}

// NoteContent is a note, read.
type NoteContent struct {
	Title     string
	Content   string
	UpdatedAt string
}

// Workspace is what the tools can reach, as functions rather than as
// repositories.
//
// Plain fields, the way the harness runner takes its dependencies: what varies
// between production and a test is where a note comes from, and that is one
// function. It also keeps this package from importing the modules — the search
// index and the notes table stay one module's business, and this one is handed
// the ability to ask.
type Workspace struct {
	// SearchNotes finds notes matching a query. Already limited to this
	// workspace and to notes by whoever supplied it.
	SearchNotes func(query string) ([]NoteMatch, error)
	// ReadNote returns one note's content, or an error if there is no such
	// note in this workspace.
	ReadNote func(id string) (NoteContent, error)
	// ReadTasks returns the workspace's task list as it stands.
	ReadTasks func() (string, error)

	// ProposeEdit records a change to a note for somebody to agree to, and does
	// not make it.
	//
	// Nil is not an oversight and not a degraded mode: a workspace built without
	// it gets no writing tools at all, so a surface that has not thought about
	// confirmation cannot offer one by forgetting to. The read tools are always
	// there; this is the only thing that decides whether the model can ask to
	// change anything.
	ProposeEdit func(ProposedEdit) error
}

// maxMatches bounds a search result.
//
// The model reads this, and fifty lines of snippets is most of a context window
// spent on deciding which note to read. When the cut bites the model is told
// how many were left out, because a list that silently stops at ten reads as
// "these are all of them" and changes what an answer claims.
const maxMatches = 10

// maxNoteRunes bounds one note.
//
// Counted in runes so a note in Chinese is cut at the same size as one in
// English rather than at a third of it. A truncated note says so, in the note's
// own text, for the same reason as above: a model that cannot see the end of a
// file will answer about the end of the file unless told it did not get one.
const maxNoteRunes = 12000

// New returns the tools for one workspace.
//
// The reading tools always. A writing one only when the workspace was given
// somewhere to put a proposal, so that offering the model a way to change a
// note is a thing a caller does on purpose rather than a thing it gets by
// default and has to remember to take away.
func New(workspace Workspace) []agent.Tool {
	tools := []agent.Tool{
		&searchNotes{workspace: workspace},
		&readNote{workspace: workspace},
		&readTasks{workspace: workspace},
	}

	if workspace.ProposeEdit != nil {
		tools = append(tools, &editNote{workspace: workspace})
	}

	return tools
}

type searchNotes struct{ workspace Workspace }

func (t *searchNotes) Definition() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name: "search_notes",
		// The description is the entire brief. A model decides whether to reach
		// for a tool from this sentence and the schema, so it says what the
		// tool is for and what to do with what comes back.
		Description: "Search the notes in this workspace by keyword. Returns matching notes with " +
			"their id and a short excerpt. Use read_note with an id to read one in full.",
		Schema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"query": {
					"type": "string",
					"description": "Keywords to search for. Not a sentence — the words that would appear in the note."
				}
			},
			"required": ["query"]
		}`),
	}
}

func (t *searchNotes) Run(_ context.Context, call agent.Call) (string, error) {
	var arguments struct {
		Query string `json:"query"`
	}
	if err := json.Unmarshal(call.Input, &arguments); err != nil {
		return "", fmt.Errorf("could not read the arguments: %v", err)
	}

	query := strings.TrimSpace(arguments.Query)
	if query == "" {
		return "", fmt.Errorf("query is required and cannot be empty")
	}

	matches, err := t.workspace.SearchNotes(query)
	if err != nil {
		return "", fmt.Errorf("the search failed: %v", err)
	}

	// Said in words rather than returned as nothing. A model handed an empty
	// result reads it as a broken tool and answers from its own invention.
	if len(matches) == 0 {
		return fmt.Sprintf("No notes in this workspace match %q.", query), nil
	}

	var out strings.Builder
	shown := matches
	if len(shown) > maxMatches {
		shown = shown[:maxMatches]
	}

	fmt.Fprintf(&out, "%d notes match %q", len(matches), query)
	if len(shown) < len(matches) {
		fmt.Fprintf(&out, ", the %d most relevant shown", len(shown))
	}
	out.WriteString(":\n")

	for _, match := range shown {
		fmt.Fprintf(&out, "\n- id: %s\n  title: %s\n", match.ID, match.Title)
		if match.Snippet != "" {
			fmt.Fprintf(&out, "  excerpt: %s\n", singleLine(match.Snippet))
		}
	}

	return out.String(), nil
}

type readNote struct{ workspace Workspace }

func (t *readNote) Definition() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name: "read_note",
		Description: "Read one note in this workspace in full, by its id. " +
			"Use search_notes first to find the id.",
		Schema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"id": {
					"type": "string",
					"description": "The note's id, exactly as search_notes gave it."
				}
			},
			"required": ["id"]
		}`),
	}
}

func (t *readNote) Run(_ context.Context, call agent.Call) (string, error) {
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
		// What to do next, not just what went wrong. A model told only "not
		// found" tries the same id again.
		return "", fmt.Errorf(
			"no note with id %q in this workspace. Use search_notes to find the right id", id,
		)
	}

	content, truncated := clip(note.Content, maxNoteRunes)

	var out strings.Builder
	fmt.Fprintf(&out, "title: %s\n", note.Title)
	if note.UpdatedAt != "" {
		fmt.Fprintf(&out, "last edited: %s\n", note.UpdatedAt)
	}
	out.WriteString("\n")
	out.WriteString(content)

	if truncated {
		fmt.Fprintf(&out, "\n\n[This note was cut off at %d characters. What you have is the beginning of it, not all of it.]", maxNoteRunes)
	}

	// An empty note is a fact about the workspace, not a failure to read one.
	if strings.TrimSpace(content) == "" {
		out.WriteString("(this note is empty)")
	}

	return out.String(), nil
}

type readTasks struct{ workspace Workspace }

func (t *readTasks) Definition() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name: "read_tasks",
		Description: "Read this workspace's task list. It is a single Markdown document " +
			"where a checked box means done.",
		// No arguments, and the schema says so rather than being omitted: both
		// wires want a schema, and "an object with no properties" is how you
		// write a function that takes nothing.
		Schema: json.RawMessage(`{"type": "object", "properties": {}}`),
	}
}

func (t *readTasks) Run(_ context.Context, _ agent.Call) (string, error) {
	content, err := t.workspace.ReadTasks()
	if err != nil {
		return "", fmt.Errorf("the task list could not be read: %v", err)
	}

	clipped, truncated := clip(content, maxNoteRunes)
	if strings.TrimSpace(clipped) == "" {
		return "The task list is empty.", nil
	}

	if truncated {
		return clipped + fmt.Sprintf(
			"\n\n[The task list was cut off at %d characters. What you have is the beginning of it, not all of it.]",
			maxNoteRunes,
		), nil
	}

	return clipped, nil
}

// clip cuts text to a rune count, reporting whether it had to.
func clip(text string, limit int) (string, bool) {
	runes := []rune(text)
	if len(runes) <= limit {
		return text, false
	}

	return string(runes[:limit]), true
}

// singleLine folds a snippet onto one line, since the list above is read by
// its shape and a snippet with a newline in it looks like the next entry.
func singleLine(text string) string {
	return strings.Join(strings.Fields(text), " ")
}
