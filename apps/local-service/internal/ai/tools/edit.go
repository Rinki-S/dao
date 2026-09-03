package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/rinki-s/dao/apps/local-service/internal/ai/agent"
	"github.com/rinki-s/dao/apps/local-service/internal/ai/llm"
)

// The changes a tool can ask for.
//
// The same strings the tools are called by, because a proposal is the record of
// one call and a second vocabulary for the same five things would be a second
// thing to keep in step.
const (
	KindEditNote   = "edit_note"
	KindCreateNote = "create_note"
	KindEditTasks  = "edit_tasks"
	KindRenameNote = "rename_note"
	KindDeleteNote = "delete_note"
)

// Proposed is a change worked out but not made.
//
// Carries both texts because whoever records it has to be able to show the
// change and then perform it from the same thing. Carries the call's id because
// the model is about to be left waiting on that call, and whatever answers it
// later has to answer that one.
//
// One shape for all five kinds, because what a proposal is for does not vary:
// something to show, and enough to perform it with. What varies is which fields
// are filled, and each tool's own code is the honest place to say that — a
// struct per kind would put five nearly identical things in front of every
// reader of the confirmation path, which is the path that most needs to be read
// in one piece.
type Proposed struct {
	ToolCallID string
	Kind       string

	// TargetID is what the change is against. Empty for a note that does not
	// exist yet, which is the only kind of change with nothing to point at.
	TargetID string

	// Title is what to call this when somebody is asked about it. For a note
	// that exists it is filled in by whoever records the proposal, from the note
	// it re-reads — a title the model supplied would be a title nobody checked.
	Title string

	// Before and After are what to show. A creation has no before and a deletion
	// has no after, and both of those are the empty string rather than a flag:
	// the comparison drawn from them is then right without a special case, all
	// additions in the first and all removals in the second.
	Before string
	After  string

	ExpectedUpdatedAt string
}

// maxNearbyRunes bounds the excerpt shown to a model that got its match wrong.
//
// Long enough to see the whitespace and the wording, short enough not to hand
// back a chunk of the note as consolation.
const maxNearbyRunes = 400

type editNote struct{ workspace Workspace }

func (t *editNote) Definition() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name: "edit_note",
		Description: "Propose a change to one note, by replacing an exact piece of its text. " +
			"Read the note first with read_note, and copy old_text from what you read, " +
			"character for character. The change is NOT made: it is shown to the person " +
			"whose workspace this is, and they decide. Do not say you have changed anything.",
		Schema: json.RawMessage(`{
			"type": "object",
			"properties": {
				"id": {
					"type": "string",
					"description": "The note's id, exactly as search_notes or read_note gave it."
				},
				"old_text": {
					"type": "string",
					"description": "The exact text to replace, copied from the note. It must appear in the note exactly once — include the surrounding lines if a shorter piece would match in more than one place."
				},
				"new_text": {
					"type": "string",
					"description": "What to put there instead. Use an empty string to delete the old text."
				}
			},
			"required": ["id", "old_text", "new_text"]
		}`),
	}
}

// Run works out the change and records it, then stops the run.
//
// Everything that can go wrong before that point goes back to the model as an
// ordinary failure, because the model is what can fix it — a match that did not
// land is answered with what is actually in the note at that spot, which is the
// difference between a model that corrects its quoting on the next step and one
// that tries the same string three times.
//
// Only an unambiguous match becomes a proposal. "Somewhere in the note" is not
// a change anybody can agree to.
func (t *editNote) Run(_ context.Context, call agent.Call) (string, error) {
	var arguments struct {
		ID      string `json:"id"`
		OldText string `json:"old_text"`
		NewText string `json:"new_text"`
	}
	if err := json.Unmarshal(call.Input, &arguments); err != nil {
		return "", fmt.Errorf("could not read the arguments: %v", err)
	}

	id := strings.TrimSpace(arguments.ID)
	if id == "" {
		return "", fmt.Errorf("id is required and cannot be empty")
	}
	if arguments.OldText == "" {
		return "", fmt.Errorf(
			"old_text is required: it is the exact text to replace, copied from the note. " +
				"To add to a note without replacing anything, use the end of the note as old_text " +
				"and repeat it followed by the new text as new_text",
		)
	}
	if arguments.OldText == arguments.NewText {
		return "", fmt.Errorf("old_text and new_text are the same, so there is nothing to change")
	}

	note, err := t.workspace.ReadNote(id)
	if err != nil {
		return "", fmt.Errorf(
			"no note with id %q in this workspace. Use search_notes to find the right id", id,
		)
	}

	switch count := strings.Count(note.Content, arguments.OldText); count {
	case 1:
		// The one case that can be agreed to.
	case 0:
		return "", fmt.Errorf("%s", noMatch(note, arguments.OldText))
	default:
		return "", fmt.Errorf(
			"that text appears %d times in %q, so it is not clear which one to change. "+
				"Include more of the surrounding lines in old_text so that it matches exactly one place",
			count, note.Title,
		)
	}

	after := strings.Replace(note.Content, arguments.OldText, arguments.NewText, 1)

	if err := t.workspace.Propose(Proposed{
		ToolCallID:        call.ID,
		Kind:              KindEditNote,
		TargetID:          id,
		Before:            note.Content,
		After:             after,
		ExpectedUpdatedAt: note.UpdatedAt,
	}); err != nil {
		return "", fmt.Errorf("the change could not be prepared: %v", err)
	}

	// The run stops here. Nothing this returns reaches the model, because there
	// is no result yet — there is a person to ask first.
	return "", agent.ErrAwaitingApproval
}

// noMatch tells a model that quoted the note wrongly what is actually there.
//
// The common failure by a wide margin is spacing, and the model cannot see that
// from "not found" — the two strings look identical when it re-reads its own
// attempt. So the search for a near miss is done with every run of whitespace
// flattened to one space, on both sides, which is exactly the difference it
// cannot see and no other.
//
// Comparing that way round matters: looking for the model's text inside the
// note finds nothing, because the model's text is the wrong one. It is the
// note's line, normalised, that has to be recognised as the thing the model was
// reaching for.
func noMatch(note NoteContent, attempted string) string {
	wanted := flattenSpaces(strings.SplitN(attempted, "\n", 2)[0])

	if wanted != "" {
		for _, line := range strings.Split(note.Content, "\n") {
			if !strings.Contains(flattenSpaces(line), wanted) {
				continue
			}

			nearby, _ := clip(line, maxNearbyRunes)

			return fmt.Sprintf(
				"old_text does not appear in %q. The note has this line, which is nearly it: %q. "+
					"Copy it exactly, including the spacing",
				note.Title, nearby,
			)
		}
	}

	return fmt.Sprintf(
		"old_text does not appear in %q. Read the note again with read_note and copy the text "+
			"to replace from what it returns, character for character",
		note.Title,
	)
}

func flattenSpaces(text string) string {
	return strings.Join(strings.Fields(text), " ")
}
