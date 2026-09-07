package tools

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/rinki-s/dao/apps/local-service/internal/ai/agent"
)

// what a run against a one-note workspace recorded, if anything.
type recorder struct {
	edits []Proposed
	err   error
}

func (r *recorder) propose(edit Proposed) error {
	if r.err != nil {
		return r.err
	}

	r.edits = append(r.edits, edit)

	return nil
}

func editorFor(t *testing.T, content string, into *recorder) agent.Tool {
	t.Helper()

	return noteToolFor(t, "edit_note", content, into)
}

// noteToolFor returns one tool over a workspace holding a single note.
func noteToolFor(t *testing.T, name string, content string, into *recorder) agent.Tool {
	t.Helper()

	tools := New(Workspace{
		ReadNote: func(id string) (NoteContent, error) {
			if id != "note-1" {
				return NoteContent{}, errors.New("no such note")
			}

			return NoteContent{
				Title:     "Kestrel service notes",
				Content:   content,
				UpdatedAt: "2026-09-02T09:00:00Z",
			}, nil
		},
		Propose: into.propose,
	})

	for _, tool := range tools {
		if tool.Definition().Name == name {
			return tool
		}
	}

	t.Fatalf("no %s tool was offered", name)

	return nil
}

func edit(t *testing.T, tool agent.Tool, arguments string) (string, error) {
	t.Helper()

	return tool.Run(context.Background(), agent.Call{
		ID:    "call-1",
		Input: json.RawMessage(arguments),
	})
}

const kestrel = "# Kestrel\n\nListens on 8080.\n\nRetries three times.\n"

// The whole point: it does not write, it prepares. The run stops, and what was
// prepared carries both texts and the expectation it was worked out against.
func TestAnUnambiguousMatchIsProposedRatherThanMade(t *testing.T) {
	var into recorder
	tool := editorFor(t, kestrel, &into)

	_, err := edit(t, tool, `{"id":"note-1","old_text":"Listens on 8080.","new_text":"Listens on 7743."}`)

	if !errors.Is(err, agent.ErrAwaitingApproval) {
		t.Fatalf("err = %v, want ErrAwaitingApproval", err)
	}
	if len(into.edits) != 1 {
		t.Fatalf("recorded %d changes, want 1", len(into.edits))
	}

	proposed := into.edits[0]
	if proposed.Before != kestrel {
		t.Errorf("before = %q", proposed.Before)
	}
	if proposed.After != "# Kestrel\n\nListens on 7743.\n\nRetries three times.\n" {
		t.Errorf("after = %q", proposed.After)
	}
	// The call the model is now waiting on. Whatever answers it later has to
	// answer this one.
	if proposed.ToolCallID != "call-1" {
		t.Errorf("recorded against call %q", proposed.ToolCallID)
	}
	// A plan made against the note at a moment, so that applying it after the
	// file has moved on can be refused.
	if proposed.ExpectedUpdatedAt != "2026-09-02T09:00:00Z" {
		t.Errorf("expectation = %q", proposed.ExpectedUpdatedAt)
	}
}

// "Somewhere in the note" is not a change anybody can agree to.
func TestTextAppearingTwiceIsRefused(t *testing.T) {
	var into recorder
	tool := editorFor(t, "port 8080\nport 8080\n", &into)

	_, err := edit(t, tool, `{"id":"note-1","old_text":"port 8080","new_text":"port 7743"}`)

	if errors.Is(err, agent.ErrAwaitingApproval) {
		t.Fatal("an ambiguous change was proposed")
	}
	if len(into.edits) != 0 {
		t.Fatalf("recorded %+v", into.edits)
	}
	// Told how many and told what to do about it, so the next attempt is a
	// better one rather than the same one.
	if !strings.Contains(err.Error(), "2 times") || !strings.Contains(err.Error(), "surrounding") {
		t.Errorf("the model was told %q", err.Error())
	}
}

// The common failure by a wide margin is whitespace or a near-miss on wording,
// and the model cannot see either from "not found".
func TestAMissedMatchIsAnsweredWithWhatIsActuallyThere(t *testing.T) {
	var into recorder
	tool := editorFor(t, kestrel, &into)

	// The right line, quoted with the wrong spacing.
	_, err := edit(t, tool, `{"id":"note-1","old_text":"Listens  on 8080.","new_text":"x"}`)

	if err == nil || errors.Is(err, agent.ErrAwaitingApproval) {
		t.Fatalf("err = %v", err)
	}
	if !strings.Contains(err.Error(), "Listens on 8080.") {
		t.Errorf("the model was not shown the real line: %q", err.Error())
	}
}

func TestAMatchWithNoNeighbourhoodSaysSoPlainly(t *testing.T) {
	var into recorder
	tool := editorFor(t, kestrel, &into)

	_, err := edit(t, tool, `{"id":"note-1","old_text":"nothing like this","new_text":"x"}`)

	if err == nil {
		t.Fatal("a change was proposed against text that is not there")
	}
	if !strings.Contains(err.Error(), "read_note") {
		t.Errorf("the model was not told what to do next: %q", err.Error())
	}
}

func TestAChangeThatChangesNothingIsRefused(t *testing.T) {
	var into recorder
	tool := editorFor(t, kestrel, &into)

	_, err := edit(t, tool, `{"id":"note-1","old_text":"Listens on 8080.","new_text":"Listens on 8080."}`)

	if err == nil || errors.Is(err, agent.ErrAwaitingApproval) {
		t.Fatalf("err = %v", err)
	}
	if len(into.edits) != 0 {
		t.Error("somebody would have been asked to approve nothing")
	}
}

func TestAnUnknownNoteSendsTheModelBackToSearch(t *testing.T) {
	var into recorder
	tool := editorFor(t, kestrel, &into)

	_, err := edit(t, tool, `{"id":"nope","old_text":"a","new_text":"b"}`)

	if err == nil || !strings.Contains(err.Error(), "search_notes") {
		t.Errorf("err = %v", err)
	}
}

// Empty old_text would match at position zero and silently prepend. The model
// is told the shape that actually works instead.
func TestEmptyOldTextIsRefusedWithSomethingToDoInstead(t *testing.T) {
	var into recorder
	tool := editorFor(t, kestrel, &into)

	_, err := edit(t, tool, `{"id":"note-1","old_text":"","new_text":"more"}`)

	if err == nil || errors.Is(err, agent.ErrAwaitingApproval) {
		t.Fatalf("err = %v", err)
	}
	if len(into.edits) != 0 {
		t.Error("an empty match was proposed")
	}
}

// Deleting text is replacing it with nothing, which is a legitimate change and
// not an empty argument.
func TestReplacingWithNothingIsAChange(t *testing.T) {
	var into recorder
	tool := editorFor(t, kestrel, &into)

	_, err := edit(t, tool, `{"id":"note-1","old_text":"\n\nRetries three times.\n","new_text":""}`)

	if !errors.Is(err, agent.ErrAwaitingApproval) {
		t.Fatalf("err = %v, want ErrAwaitingApproval", err)
	}
	if into.edits[0].After != "# Kestrel\n\nListens on 8080." {
		t.Errorf("after = %q", into.edits[0].After)
	}
}

// A workspace with nowhere to put a proposal gets no writing tool at all, so a
// surface that has not thought about confirmation cannot offer one by
// forgetting to.
func TestAWorkspaceWithNowhereToProposeOffersNoWritingTool(t *testing.T) {
	for _, tool := range New(Workspace{
		ReadNote: func(string) (NoteContent, error) { return NoteContent{}, nil },
	}) {
		if tool.Definition().Name == "edit_note" {
			t.Fatal("a writing tool was offered without anywhere to record a proposal")
		}
	}
}

// If the proposal cannot be recorded there is nothing for anybody to agree to,
// so the run must not stop as though there were.
func TestAProposalThatCannotBeRecordedIsAFailure(t *testing.T) {
	into := recorder{err: errors.New("database is locked")}
	tool := editorFor(t, kestrel, &into)

	_, err := edit(t, tool, `{"id":"note-1","old_text":"Listens on 8080.","new_text":"Listens on 7743."}`)

	if errors.Is(err, agent.ErrAwaitingApproval) {
		t.Fatal("the run stopped to wait for a change nobody recorded")
	}
	if err == nil {
		t.Fatal("a failure to record was reported as success")
	}
}
