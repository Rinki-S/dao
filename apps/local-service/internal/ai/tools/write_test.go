package tools

import (
	"errors"
	"strings"
	"testing"

	"github.com/rinki-s/dao/apps/local-service/internal/ai/agent"
)

const taskList = "- [ ] Write the release notes\n- [x] Rewrite the lexer\n- [ ] Ship it\n"

// writerFor returns one writing tool over a workspace with a task list in it.
func writerFor(t *testing.T, name string, list string, into *recorder) agent.Tool {
	t.Helper()

	built := New(Workspace{
		ReadTasks: func() (TaskList, error) {
			return TaskList{Content: list, UpdatedAt: "2026-09-02T09:00:00Z"}, nil
		},
		Propose: into.propose,
	})

	for _, tool := range built {
		if tool.Definition().Name == name {
			return tool
		}
	}

	t.Fatalf("no %s tool was offered", name)

	return nil
}

func TestANewNoteIsProposedRatherThanMade(t *testing.T) {
	var into recorder
	tool := writerFor(t, "create_note", taskList, &into)

	_, err := edit(t, tool, `{"title":"Kestrel","content":"# Kestrel\n\nListens on 7743."}`)

	if !errors.Is(err, agent.ErrAwaitingApproval) {
		t.Fatalf("err = %v, want ErrAwaitingApproval", err)
	}
	if len(into.edits) != 1 {
		t.Fatalf("recorded %d changes, want 1", len(into.edits))
	}

	proposed := into.edits[0]
	if proposed.Kind != KindCreateNote {
		t.Errorf("kind = %q", proposed.Kind)
	}
	if proposed.Title != "Kestrel" {
		t.Errorf("title = %q", proposed.Title)
	}
	// Nothing exists yet, so there is nothing to point at and nothing that
	// could have moved on underneath it.
	if proposed.TargetID != "" || proposed.ExpectedUpdatedAt != "" {
		t.Errorf("a note that does not exist was recorded against %+v", proposed)
	}
	// All of it is new, which is what makes the comparison drawn from these two
	// come out as every line added without anybody special-casing it.
	if proposed.Before != "" || proposed.After != "# Kestrel\n\nListens on 7743." {
		t.Errorf("before = %q, after = %q", proposed.Before, proposed.After)
	}
}

func TestANoteWithNothingInItIsRefused(t *testing.T) {
	// Agreeing to this would mean agreeing to a file with nothing in it, which
	// is a thing somebody then has to go and delete.
	var into recorder
	tool := writerFor(t, "create_note", taskList, &into)

	_, err := edit(t, tool, `{"title":"Kestrel","content":"   \n"}`)

	if err == nil || errors.Is(err, agent.ErrAwaitingApproval) {
		t.Fatalf("an empty note was proposed: %v", err)
	}
	if len(into.edits) != 0 {
		t.Error("an empty note was recorded")
	}
}

func TestANoteWithNoTitleIsRefused(t *testing.T) {
	var into recorder
	tool := writerFor(t, "create_note", taskList, &into)

	if _, err := edit(t, tool, `{"title":"  ","content":"something"}`); err == nil {
		t.Fatal("a note with no title was proposed")
	}
}

func TestATitleThatIsReallyAParagraphIsRefused(t *testing.T) {
	// The title is the filename. A model that answered with a sentence and a
	// half has written a heading and a first line, and should be told so rather
	// than have it silently become a filename.
	var into recorder
	tool := writerFor(t, "create_note", taskList, &into)

	_, err := edit(t, tool, `{"title":"Kestrel\nListens on 7743.","content":"x"}`)
	if err == nil {
		t.Fatal("a title spanning two lines was proposed")
	}
	if !strings.Contains(err.Error(), "content") {
		t.Errorf("the model was not told where the rest goes: %q", err.Error())
	}
}

func TestAChangeToTheTaskListIsProposedRatherThanMade(t *testing.T) {
	var into recorder
	tool := writerFor(t, "edit_tasks", taskList, &into)

	_, err := edit(t, tool, `{"old_text":"- [ ] Ship it","new_text":"- [x] Ship it"}`)

	if !errors.Is(err, agent.ErrAwaitingApproval) {
		t.Fatalf("err = %v, want ErrAwaitingApproval", err)
	}
	if len(into.edits) != 1 {
		t.Fatalf("recorded %d changes, want 1", len(into.edits))
	}

	proposed := into.edits[0]
	if proposed.Kind != KindEditTasks {
		t.Errorf("kind = %q", proposed.Kind)
	}
	if proposed.Before != taskList {
		t.Errorf("before = %q", proposed.Before)
	}
	if !strings.Contains(proposed.After, "- [x] Ship it") {
		t.Errorf("after = %q", proposed.After)
	}
	// The moment it was worked out against, so a list that moved on while
	// somebody was deciding can be refused rather than written over.
	if proposed.ExpectedUpdatedAt != "2026-09-02T09:00:00Z" {
		t.Errorf("expectation = %q", proposed.ExpectedUpdatedAt)
	}
	// Named here, because there is no row anywhere to read a name off.
	if proposed.Title == "" {
		t.Error("the change has nothing to call itself")
	}
}

func TestATaskLineThatMatchesTwiceIsRefused(t *testing.T) {
	// A task list is mostly short similar lines, which is exactly the text a
	// one-line old_text matches twice. Ticking "the" second one is not something
	// anybody can agree to.
	var into recorder
	repeated := "- [ ] Review\n- [ ] Ship it\n- [ ] Review\n"
	tool := writerFor(t, "edit_tasks", repeated, &into)

	_, err := edit(t, tool, `{"old_text":"- [ ] Review","new_text":"- [x] Review"}`)
	if err == nil {
		t.Fatal("an ambiguous change was proposed")
	}
	if !strings.Contains(err.Error(), "2 times") {
		t.Errorf("the model was not told how many: %q", err.Error())
	}
	if len(into.edits) != 0 {
		t.Error("an ambiguous change was recorded")
	}
}

func TestAMissedTaskLineSaysWhatToReadItWith(t *testing.T) {
	// "Read it again" without saying with what is advice a model cannot act on,
	// and the tool to name here is not the one the note editor would name.
	var into recorder
	tool := writerFor(t, "edit_tasks", taskList, &into)

	_, err := edit(t, tool, `{"old_text":"- [ ] Nothing like this","new_text":"x"}`)
	if err == nil {
		t.Fatal("a change was proposed against a line that is not there")
	}
	if !strings.Contains(err.Error(), "read_tasks") {
		t.Errorf("the model was not told what to do next: %q", err.Error())
	}
}

func TestATaskLineQuotedWithTheWrongSpacingIsAnsweredWithTheRealOne(t *testing.T) {
	// The failure the model cannot see by re-reading its own attempt: the two
	// strings look identical to it. Answering with the line it was reaching for
	// is the difference between a model that fixes its quoting on the next step
	// and one that tries the same string three times.
	//
	// Only spacing inside the line, note. A line quoted without its leading
	// indentation is still found, and replacing it leaves the indentation where
	// it was — so a subtask does not stop being one by being ticked.
	var into recorder
	tool := writerFor(t, "edit_tasks", "- [ ] Ship it\n- [ ]  Tag  the release\n", &into)

	_, err := edit(t, tool, `{"old_text":"- [ ] Tag the release","new_text":"- [x] Tag the release"}`)
	if err == nil {
		t.Fatal("a change was proposed against text that is not there")
	}
	if !strings.Contains(err.Error(), "Tag  the release") {
		t.Errorf("the model was not shown the line it was reaching for: %q", err.Error())
	}
}

func TestATaskSubtaskKeepsItsIndentationWhenTicked(t *testing.T) {
	var into recorder
	tool := writerFor(t, "edit_tasks", "- [ ] Ship it\n  - [ ] Tag the release\n", &into)

	if _, err := edit(
		t, tool, `{"old_text":"- [ ] Tag the release","new_text":"- [x] Tag the release"}`,
	); !errors.Is(err, agent.ErrAwaitingApproval) {
		t.Fatalf("err = %v, want ErrAwaitingApproval", err)
	}

	if after := into.edits[0].After; after != "- [ ] Ship it\n  - [x] Tag the release\n" {
		t.Errorf("after = %q", after)
	}
}

func TestATaskChangeThatChangesNothingIsRefused(t *testing.T) {
	var into recorder
	tool := writerFor(t, "edit_tasks", taskList, &into)

	if _, err := edit(t, tool, `{"old_text":"- [ ] Ship it","new_text":"- [ ] Ship it"}`); err == nil {
		t.Fatal("a change that changes nothing was proposed")
	}
}

// The rule the whole package is built on, checked for the tools that were just
// added: no way to record a change means no way to ask for one.
func TestAWorkspaceWithNowhereToPutAChangeOffersNoWritingTools(t *testing.T) {
	built := New(Workspace{
		ReadTasks: func() (TaskList, error) { return TaskList{}, nil },
	})

	for _, tool := range built {
		switch tool.Definition().Name {
		case "create_note", "edit_tasks", "edit_note":
			t.Errorf("%s was offered without anywhere to record a proposal", tool.Definition().Name)
		}
	}
}
