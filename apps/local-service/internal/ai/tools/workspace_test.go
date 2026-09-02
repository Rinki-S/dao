package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"github.com/rinki-s/dao/apps/local-service/internal/ai/agent"
)

func find(t *testing.T, tools []agent.Tool, name string) agent.Tool {
	t.Helper()

	for _, tool := range tools {
		if tool.Definition().Name == name {
			return tool
		}
	}

	t.Fatalf("no tool named %q", name)

	return nil
}

func run(t *testing.T, tool agent.Tool, input string) (string, error) {
	t.Helper()

	return tool.Run(context.Background(), agent.Call{ID: "call-1", Input: json.RawMessage(input)})
}

func TestSearchListsMatchesWithTheIdsNeededToReadThem(t *testing.T) {
	tools := New(Workspace{
		SearchNotes: func(string) ([]NoteMatch, error) {
			return []NoteMatch{
				{ID: "note-1", Title: "Parser recovery", Snippet: "the recovery\npath now..."},
				{ID: "note-2", Title: "Error handling", Snippet: "errors are..."},
			}, nil
		},
	})

	output, err := run(t, find(t, tools, "search_notes"), `{"query":"parser"}`)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}

	// The id is what read_note needs, so it has to survive into the text the
	// model reads.
	for _, want := range []string{"note-1", "note-2", "Parser recovery"} {
		if !strings.Contains(output, want) {
			t.Errorf("output does not mention %q:\n%s", want, output)
		}
	}
	// A snippet with a newline in it would look like the next entry.
	if strings.Contains(output, "the recovery\npath") {
		t.Errorf("a snippet was left spanning two lines:\n%s", output)
	}
}

// A model handed nothing reads it as a broken tool and answers from its own
// invention, so finding nothing is said in words.
func TestSearchSaysSoWhenNothingMatches(t *testing.T) {
	tools := New(Workspace{
		SearchNotes: func(string) ([]NoteMatch, error) { return nil, nil },
	})

	output, err := run(t, find(t, tools, "search_notes"), `{"query":"kangaroo"}`)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if !strings.Contains(output, "No notes") || !strings.Contains(output, "kangaroo") {
		t.Errorf("output = %q", output)
	}
}

// A list that silently stops at ten reads as "these are all of them", and
// changes what an answer built on it claims.
func TestSearchSaysWhatItLeftOut(t *testing.T) {
	var many []NoteMatch
	for index := 0; index < 25; index++ {
		many = append(many, NoteMatch{ID: fmt.Sprintf("note-%d", index), Title: "A note"})
	}

	tools := New(Workspace{
		SearchNotes: func(string) ([]NoteMatch, error) { return many, nil },
	})

	output, err := run(t, find(t, tools, "search_notes"), `{"query":"note"}`)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}

	if !strings.Contains(output, "25 notes match") {
		t.Errorf("the total was not reported:\n%s", output)
	}
	if strings.Count(output, "id: ") != maxMatches {
		t.Errorf("listed %d notes, want %d", strings.Count(output, "id: "), maxMatches)
	}
	if !strings.Contains(output, "most relevant shown") {
		t.Errorf("the cut was not reported:\n%s", output)
	}
}

func TestReadNoteReturnsTheNote(t *testing.T) {
	tools := New(Workspace{
		ReadNote: func(id string) (NoteContent, error) {
			if id != "note-1" {
				return NoteContent{}, fmt.Errorf("not found")
			}
			return NoteContent{
				Title:     "Parser recovery",
				Content:   "The lexer flushes late.",
				UpdatedAt: "2026-08-27T09:00:00Z",
			}, nil
		},
	})

	output, err := run(t, find(t, tools, "read_note"), `{"id":"note-1"}`)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}

	if !strings.Contains(output, "Parser recovery") || !strings.Contains(output, "The lexer flushes late.") {
		t.Errorf("output = %q", output)
	}
}

// A model told only "not found" tries the same id again.
func TestReadNoteSaysWhatToDoInstead(t *testing.T) {
	tools := New(Workspace{
		ReadNote: func(string) (NoteContent, error) { return NoteContent{}, fmt.Errorf("nope") },
	})

	_, err := run(t, find(t, tools, "read_note"), `{"id":"invented"}`)
	if err == nil {
		t.Fatal("reading a note that does not exist succeeded")
	}
	if !strings.Contains(err.Error(), "search_notes") {
		t.Errorf("the model was not told what to try instead: %v", err)
	}
}

// A model that cannot see the end of a file will answer about the end of the
// file unless it is told it did not get one.
func TestALongNoteSaysThatItWasCut(t *testing.T) {
	// In runes that are three bytes each, so a byte-counting cut would land in
	// the wrong place and give a different length.
	long := strings.Repeat("字", maxNoteRunes+500)

	tools := New(Workspace{
		ReadNote: func(string) (NoteContent, error) {
			return NoteContent{Title: "Long", Content: long}, nil
		},
	})

	output, err := run(t, find(t, tools, "read_note"), `{"id":"note-1"}`)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}

	if !strings.Contains(output, "cut off") {
		t.Errorf("a truncated note did not say so")
	}
	if strings.Count(output, "字") != maxNoteRunes {
		t.Errorf("kept %d characters, want %d", strings.Count(output, "字"), maxNoteRunes)
	}
}

func TestReadTasksReturnsTheList(t *testing.T) {
	tools := New(Workspace{
		ReadTasks: func() (string, error) { return "- [ ] write the release notes", nil },
	})

	output, err := run(t, find(t, tools, "read_tasks"), `{}`)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if !strings.Contains(output, "release notes") {
		t.Errorf("output = %q", output)
	}
}

func TestAnEmptyTaskListSaysSo(t *testing.T) {
	tools := New(Workspace{
		ReadTasks: func() (string, error) { return "   \n", nil },
	})

	output, err := run(t, find(t, tools, "read_tasks"), `{}`)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if !strings.Contains(output, "empty") {
		t.Errorf("output = %q", output)
	}
}

// The model has nowhere to put another workspace's name, which is the property
// the package exists to have. This test is the statement of it: every schema is
// checked for a field that would let one in.
func TestNoToolTakesAWorkspace(t *testing.T) {
	for _, tool := range New(Workspace{}) {
		definition := tool.Definition()

		var schema struct {
			Properties map[string]any `json:"properties"`
		}
		if err := json.Unmarshal(definition.Schema, &schema); err != nil {
			t.Fatalf("%s has an unreadable schema: %v", definition.Name, err)
		}

		for property := range schema.Properties {
			if strings.Contains(strings.ToLower(property), "workspace") {
				t.Errorf("%s takes a %q, which the model could set", definition.Name, property)
			}
		}
	}
}

// Both wires want a schema on every tool, and reject one without.
func TestEveryToolIsDescribed(t *testing.T) {
	for _, tool := range New(Workspace{}) {
		definition := tool.Definition()

		if definition.Name == "" || definition.Description == "" {
			t.Errorf("tool %+v is missing its name or description", definition)
		}
		if !json.Valid(definition.Schema) {
			t.Errorf("%s has an invalid schema: %s", definition.Name, definition.Schema)
		}
	}
}

// Arguments come from a model, so they arrive however the model wrote them.
func TestBadArgumentsAreRefusedInWords(t *testing.T) {
	tools := New(Workspace{
		SearchNotes: func(string) ([]NoteMatch, error) {
			t.Error("the search ran on arguments that should have been refused")
			return nil, nil
		},
	})
	search := find(t, tools, "search_notes")

	if _, err := run(t, search, `{"query":`); err == nil {
		t.Error("arguments that were not JSON were accepted")
	}
	if _, err := run(t, search, `{"query":"   "}`); err == nil {
		t.Error("an empty query was accepted")
	}
}
