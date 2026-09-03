package chats

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/rinki-s/dao/apps/local-service/internal/ai/agent"
	"github.com/rinki-s/dao/apps/local-service/internal/ai/llm"
	"github.com/rinki-s/dao/apps/local-service/internal/ai/llm/llmtest"
	"github.com/rinki-s/dao/apps/local-service/internal/modules/proposals"
)

// proposingTool prepares a change and stops, the way a real writing tool does.
type proposingTool struct {
	repo           *proposals.Repository
	conversationID string
	runs           int
}

func (p *proposingTool) Definition() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name:        "edit_note",
		Description: "propose a change",
		Schema:      json.RawMessage(`{"type":"object"}`),
	}
}

func (p *proposingTool) Run(_ context.Context, call agent.Call) (string, error) {
	p.runs++

	if _, err := p.repo.Create(proposals.CreateRequest{
		WorkspaceID:    "ws-1",
		ConversationID: p.conversationID,
		ToolCallID:     call.ID,
		Kind:           proposals.KindEditNote,
		TargetID:       "note-1",
		Title:          "Kestrel service notes",
		Before:         "Listens on 8080.",
		After:          "Listens on 7743.",
	}); err != nil {
		return "", err
	}

	return "", agent.ErrAwaitingApproval
}

// applied records what a decision asked the world to do.
type applied struct {
	proposals []proposals.Proposal
	err       error
}

func (a *applied) apply(proposal proposals.Proposal) (string, error) {
	if a.err != nil {
		return "", a.err
	}

	a.proposals = append(a.proposals, proposal)

	return "The change to " + proposal.Title + " was applied.", nil
}

func proposingHandler(t *testing.T, client llm.Client) (
	*Handler, *Repository, *proposals.Repository, *applied, *proposingTool,
) {
	t.Helper()

	handler, repo := newHandler(t, client, nil)

	if _, err := repo.db.Exec(`
		CREATE TABLE proposals (
			id TEXT PRIMARY KEY,
			workspace_id TEXT NOT NULL,
			conversation_id TEXT NOT NULL,
			tool_call_id TEXT NOT NULL,
			kind TEXT NOT NULL,
			target_id TEXT NOT NULL DEFAULT '',
			title TEXT NOT NULL DEFAULT '',
			before_text TEXT NOT NULL DEFAULT '',
			after_text TEXT NOT NULL DEFAULT '',
			expected_updated_at TEXT NOT NULL DEFAULT '',
			status TEXT NOT NULL DEFAULT 'pending',
			outcome TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL,
			resolved_at TEXT,
			UNIQUE (conversation_id, tool_call_id)
		);
	`); err != nil {
		t.Fatalf("create proposals table: %v", err)
	}

	proposalRepo := proposals.NewRepository(repo.db)
	repo.WithProposals(proposalRepo)

	tool := &proposingTool{repo: proposalRepo}
	world := &applied{}

	handler.
		WithTools(func(_ string, conversationID string) []agent.Tool {
			tool.conversationID = conversationID
			return []agent.Tool{tool}
		}).
		WithProposals(proposalRepo, world.apply)

	return handler, repo, proposalRepo, world, tool
}

func decide(
	t *testing.T, handler *Handler, conversationID, proposalID, decision string,
) *httptest.ResponseRecorder {
	t.Helper()

	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	body := strings.NewReader(`{"decision":"` + decision + `"}`)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api/chats/"+conversationID+"/proposals/"+proposalID+"", body,
	)
	recorder := httptest.NewRecorder()

	mux.ServeHTTP(recorder, request)

	return recorder
}

// The whole shape, end to end: the model asks, the turn stops with the change
// recorded and nothing written, the person says yes, and the conversation
// carries on from where it stopped.
func TestAProposedChangeStopsTheTurnAndCarriesOnWhenApproved(t *testing.T) {
	model := llmtest.Sequence(
		llmtest.Turn{
			Text:  "I can fix that. ",
			Calls: llmtest.ToolCall("call-1", "edit_note", `{}`).Calls,
		},
		llmtest.Turn{Text: "Done — the port is now 7743.", Stop: llm.StopEnd},
	)

	handler, repo, proposalRepo, world, _ := proposingHandler(t, model)
	conversation := newConversation(t, repo)

	send(t, handler, conversation.ID, "fix the port in the kestrel note")

	// Stopped, with the change waiting and nothing written.
	waiting, found, err := proposalRepo.Waiting(conversation.ID)
	if err != nil || !found {
		t.Fatalf("nothing is waiting: found=%v err=%v", found, err)
	}
	if len(world.proposals) != 0 {
		t.Fatal("something was written before anybody agreed to it")
	}

	// The turn holds a call with no answer, which is what says the conversation
	// is stopped rather than finished.
	messages, _ := repo.Messages(conversation.ID)
	last := messages[len(messages)-1]
	if len(last.ToolCalls) != 1 || last.ToolCalls[0].Status != ToolCallPending {
		t.Fatalf("the stopped turn is %+v", last.ToolCalls)
	}
	if last.Content != "I can fix that. " {
		t.Errorf("what the model said before stopping was not kept: %q", last.Content)
	}

	recorder := decide(t, handler, conversation.ID, waiting.ID, DecisionApply)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", recorder.Code, recorder.Body.String())
	}

	if len(world.proposals) != 1 || world.proposals[0].After != "Listens on 7743." {
		t.Fatalf("applied %+v", world.proposals)
	}

	// The model was asked again, with the answer to its own call.
	if len(model.Requests) != 2 {
		t.Fatalf("the model was asked %d times, want 2", len(model.Requests))
	}
	second := model.Requests[1].Messages
	result := second[len(second)-1]
	if result.Content[0].Kind != llm.KindToolResult || result.Content[0].ID != "call-1" {
		t.Fatalf("the resumed request ended with %+v", result.Content[0])
	}
	if !strings.Contains(result.Content[0].Text, "was applied") {
		t.Errorf("the model was told %q", result.Content[0].Text)
	}

	// And what it said next is a turn of its own.
	messages, _ = repo.Messages(conversation.ID)
	if messages[len(messages)-1].Content != "Done — the port is now 7743." {
		t.Errorf("the continuation was not stored: %+v", messages[len(messages)-1])
	}
}

// Saying no is a complete answer, not a failure to work around.
func TestDiscardingWritesNothingAndTellsTheModelSo(t *testing.T) {
	model := llmtest.Sequence(
		llmtest.Turn{Calls: llmtest.ToolCall("call-1", "edit_note", `{}`).Calls},
		llmtest.Turn{Text: "Understood.", Stop: llm.StopEnd},
	)

	handler, repo, proposalRepo, world, _ := proposingHandler(t, model)
	conversation := newConversation(t, repo)
	send(t, handler, conversation.ID, "fix the port")

	waiting, _, _ := proposalRepo.Waiting(conversation.ID)

	if recorder := decide(
		t, handler, conversation.ID, waiting.ID, DecisionDiscard,
	); recorder.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", recorder.Code, recorder.Body.String())
	}

	if len(world.proposals) != 0 {
		t.Fatal("a declined change was written anyway")
	}

	second := model.Requests[1].Messages
	result := second[len(second)-1].Content[0]
	if result.IsError {
		t.Error("being told no was reported to the model as a failure")
	}
	if !strings.Contains(result.Text, "declined") {
		t.Errorf("the model was told %q", result.Text)
	}
}

// The rule that keeps the transcript usable: a tool call with no result cannot
// be replayed, so walking away has to answer it too.
func TestSayingSomethingElseAbandonsTheWaitingChange(t *testing.T) {
	model := llmtest.Sequence(
		llmtest.Turn{Calls: llmtest.ToolCall("call-1", "edit_note", `{}`).Calls},
		llmtest.Turn{Text: "All right.", Stop: llm.StopEnd},
	)

	handler, repo, proposalRepo, world, _ := proposingHandler(t, model)
	conversation := newConversation(t, repo)
	send(t, handler, conversation.ID, "fix the port")

	send(t, handler, conversation.ID, "actually, never mind")

	if len(world.proposals) != 0 {
		t.Fatal("walking away wrote the change")
	}
	if _, found, _ := proposalRepo.Waiting(conversation.ID); found {
		t.Error("the change is still waiting after the person moved on")
	}

	// Answered, so the next turn can be read back to a model at all.
	messages, _ := repo.Messages(conversation.ID)
	for _, message := range messages {
		for _, call := range message.ToolCalls {
			if call.Status == ToolCallPending {
				t.Fatalf("a call was left unanswered: %+v", call)
			}
		}
	}

	// And the model is told plainly, so it does not go on believing it happened.
	second := model.Requests[1].Messages
	said := ""
	for _, message := range second {
		for _, block := range message.Content {
			if block.Kind == llm.KindToolResult {
				said = block.Text
			}
		}
	}
	if !strings.Contains(said, "Nothing was written") {
		t.Errorf("the model was told %q", said)
	}
}

func TestAChangeCannotBeAnsweredTwiceOverTheWire(t *testing.T) {
	model := llmtest.Sequence(
		llmtest.Turn{Calls: llmtest.ToolCall("call-1", "edit_note", `{}`).Calls},
		llmtest.Turn{Text: "Done.", Stop: llm.StopEnd},
		llmtest.Turn{Text: "Done again?", Stop: llm.StopEnd},
	)

	handler, repo, proposalRepo, world, _ := proposingHandler(t, model)
	conversation := newConversation(t, repo)
	send(t, handler, conversation.ID, "fix the port")

	waiting, _, _ := proposalRepo.Waiting(conversation.ID)

	decide(t, handler, conversation.ID, waiting.ID, DecisionApply)
	second := decide(t, handler, conversation.ID, waiting.ID, DecisionApply)

	if second.Code != http.StatusConflict {
		t.Errorf("answering twice gave %d, want 409", second.Code)
	}
	if len(world.proposals) != 1 {
		t.Errorf("the change was written %d times", len(world.proposals))
	}
}

// An id is not enough. A change prepared in another conversation is not one the
// person answering here ever saw.
func TestAChangeFromAnotherConversationIsNotFound(t *testing.T) {
	model := llmtest.Sequence(
		llmtest.Turn{Calls: llmtest.ToolCall("call-1", "edit_note", `{}`).Calls},
	)

	handler, repo, proposalRepo, _, _ := proposingHandler(t, model)
	conversation := newConversation(t, repo)
	send(t, handler, conversation.ID, "fix the port")

	waiting, _, _ := proposalRepo.Waiting(conversation.ID)
	elsewhere := newConversation(t, repo)

	if recorder := decide(
		t, handler, elsewhere.ID, waiting.ID, DecisionApply,
	); recorder.Code != http.StatusNotFound {
		t.Errorf("status = %d, want 404", recorder.Code)
	}
}

// A change that could not be written must not be reported as written, or the
// model goes on describing a workspace that does not exist.
func TestAFailedApplyIsToldToTheModelAsAFailure(t *testing.T) {
	model := llmtest.Sequence(
		llmtest.Turn{Calls: llmtest.ToolCall("call-1", "edit_note", `{}`).Calls},
		llmtest.Turn{Text: "I could not change it.", Stop: llm.StopEnd},
	)

	handler, repo, proposalRepo, world, _ := proposingHandler(t, model)
	world.err = errNoteMoved
	conversation := newConversation(t, repo)
	send(t, handler, conversation.ID, "fix the port")

	waiting, _, _ := proposalRepo.Waiting(conversation.ID)
	decide(t, handler, conversation.ID, waiting.ID, DecisionApply)

	second := model.Requests[1].Messages
	result := second[len(second)-1].Content[0]
	if !result.IsError {
		t.Error("a change that was not written was reported to the model as done")
	}
	if !strings.Contains(result.Text, "could not be applied") {
		t.Errorf("the model was told %q", result.Text)
	}
}

var errNoteMoved = &staticError{"the note changed after this was prepared"}

type staticError struct{ text string }

func (e *staticError) Error() string { return e.text }

// What the interface is actually handed.
//
// The renderer joins a change to the turn that asked for it on the call's id,
// draws the comparison the service computed, and files a continuation under no
// user turn at all. Each of those is a claim about this wire, so each is checked
// here rather than only in the shapes the Go side passes around.
func TestTheWireCarriesWhatTheInterfaceDrawsFrom(t *testing.T) {
	model := llmtest.Sequence(
		llmtest.Turn{
			Text:  "I can fix that. ",
			Calls: llmtest.ToolCall("call-1", "edit_note", `{}`).Calls,
		},
		llmtest.Turn{Text: "Done.", Stop: llm.StopEnd},
	)

	handler, repo, proposalRepo, _, _ := proposingHandler(t, model)
	conversation := newConversation(t, repo)

	stream := send(t, handler, conversation.ID, "fix the port").Body.String()

	// The change goes out before the turn it belongs to, so there is never a
	// render holding a stopped conversation with nothing to answer.
	proposalAt := strings.Index(stream, "event: proposal")
	doneAt := strings.Index(stream, "event: done")
	if proposalAt < 0 || doneAt < 0 || proposalAt > doneAt {
		t.Fatalf("proposal at %d, done at %d in:\n%s", proposalAt, doneAt, stream)
	}

	waiting, _, err := proposalRepo.Waiting(conversation.ID)
	if err != nil {
		t.Fatalf("Waiting: %v", err)
	}

	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	recorder := httptest.NewRecorder()
	mux.ServeHTTP(recorder, httptest.NewRequest(
		http.MethodGet, "/api/chats/"+conversation.ID, nil,
	))

	var detail struct {
		Messages []struct {
			ToolCalls []ToolCall `json:"toolCalls"`
		} `json:"messages"`
		Proposals []struct {
			ID         string `json:"id"`
			ToolCallID string `json:"toolCallId"`
			Kind       string `json:"kind"`
			Title      string `json:"title"`
			Status     string `json:"status"`
			Diff       []struct {
				Op   string `json:"op"`
				Text string `json:"text"`
			} `json:"diff"`
		} `json:"proposals"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &detail); err != nil {
		t.Fatalf("read the conversation: %v", err)
	}

	if len(detail.Proposals) != 1 {
		t.Fatalf("the conversation came back with %d changes", len(detail.Proposals))
	}
	change := detail.Proposals[0]
	if change.ID != waiting.ID || change.Status != proposals.StatusPending {
		t.Errorf("the change came back as %+v", change)
	}

	// The comparison, computed by the service. Without it the renderer would
	// have to work out what changed for itself, and what somebody agreed to
	// would stop being what gets written.
	if len(change.Diff) != 2 ||
		change.Diff[0].Op != "remove" || change.Diff[0].Text != "Listens on 8080." ||
		change.Diff[1].Op != "add" || change.Diff[1].Text != "Listens on 7743." {
		t.Errorf("the comparison came back as %+v", change.Diff)
	}

	// The join: the card is drawn under the turn holding the call it answers.
	last := detail.Messages[len(detail.Messages)-1]
	if len(last.ToolCalls) != 1 || last.ToolCalls[0].ID != change.ToolCallID {
		t.Fatalf("nothing in the transcript holds call %q: %+v", change.ToolCallID, last.ToolCalls)
	}

	// And a turn nobody started says so, rather than sending an empty one.
	answered := decide(t, handler, conversation.ID, change.ID, DecisionApply)
	start := answered.Body.String()
	start = start[strings.Index(start, "event: start"):]
	start = start[:strings.Index(start, "\n\n")]
	if strings.Contains(start, "userMessage") {
		t.Errorf("the continuation claims somebody said something: %s", start)
	}
}
