package chats

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"github.com/rinki-s/dao/apps/local-service/internal/ai/agent"
	"github.com/rinki-s/dao/apps/local-service/internal/ai/llm"
	"github.com/rinki-s/dao/apps/local-service/internal/ai/llm/llmtest"
)

// event is one server-sent event, parsed back out of the response body.
type event struct {
	name string
	data string
}

// parseEvents reads the wire format rather than trusting the writer that
// produced it. A test that asserted on a struct the handler also built would
// pass on a stream no browser could read.
func parseEvents(t *testing.T, body string) []event {
	t.Helper()

	events := []event{}

	for _, block := range strings.Split(strings.TrimSpace(body), "\n\n") {
		if block == "" {
			continue
		}

		var parsed event
		for _, line := range strings.Split(block, "\n") {
			switch {
			case strings.HasPrefix(line, "event: "):
				parsed.name = strings.TrimPrefix(line, "event: ")
			case strings.HasPrefix(line, "data: "):
				parsed.data = strings.TrimPrefix(line, "data: ")
			default:
				t.Fatalf("unexpected line in stream: %q", line)
			}
		}

		events = append(events, parsed)
	}

	return events
}

func names(events []event) []string {
	found := []string{}
	for _, e := range events {
		found = append(found, e.name)
	}
	return found
}

// lastData decodes the payload of the final event, which is always done.
func lastData(t *testing.T, events []event, into any) {
	t.Helper()

	if len(events) == 0 {
		t.Fatal("no events in the stream")
	}

	final := events[len(events)-1]
	if final.name != EventDone {
		t.Fatalf("stream ended with %q, want %q", final.name, EventDone)
	}

	if err := json.Unmarshal([]byte(final.data), into); err != nil {
		t.Fatalf("decode done event: %v", err)
	}
}

func newHandler(t *testing.T, client llm.Client, clientErr error) (*Handler, *Repository) {
	t.Helper()

	repo := newRepo(t)
	handler := NewHandler(
		repo,
		func() (llm.Client, error) { return client, clientErr },
		func() (string, string) { return "openai", "test-model" },
	)

	return handler, repo
}

func send(t *testing.T, handler *Handler, conversationID, content string) *httptest.ResponseRecorder {
	t.Helper()

	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	body := strings.NewReader(`{"content":` + quote(content) + `}`)
	request := httptest.NewRequest(http.MethodPost, "/api/chats/"+conversationID+"/messages", body)
	recorder := httptest.NewRecorder()

	mux.ServeHTTP(recorder, request)

	return recorder
}

func quote(text string) string {
	encoded, _ := json.Marshal(text)
	return string(encoded)
}

func TestSendStreamsTheReplyAndStoresBothTurns(t *testing.T) {
	fake := llmtest.Streamed("The answer, in four pieces.", 4)
	handler, repo := newHandler(t, fake, nil)
	conversation := newConversation(t, repo)

	recorder := send(t, handler, conversation.ID, "What is the question?")

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", recorder.Code)
	}
	if contentType := recorder.Header().Get("Content-Type"); contentType != "text/event-stream" {
		t.Fatalf("Content-Type = %q, want text/event-stream", contentType)
	}

	events := parseEvents(t, recorder.Body.String())
	if got := names(events); len(got) != 6 ||
		got[0] != EventStart || got[len(got)-1] != EventDone {
		t.Fatalf("events = %v, want start, four deltas and done", got)
	}

	// The deltas reassemble into the answer. Where the splits land is the
	// endpoint's business, so the test joins rather than matching piece by piece.
	assembled := ""
	for _, e := range events[1 : len(events)-1] {
		var delta DeltaEvent
		if err := json.Unmarshal([]byte(e.data), &delta); err != nil {
			t.Fatalf("decode delta: %v", err)
		}
		assembled += delta.Text
	}
	if assembled != "The answer, in four pieces." {
		t.Fatalf("assembled deltas = %q", assembled)
	}

	// What the client is left holding after done must be what a reload shows.
	var final Message
	lastData(t, events, &final)

	stored, err := repo.Messages(conversation.ID)
	if err != nil {
		t.Fatalf("Messages: %v", err)
	}
	if len(stored) != 2 {
		t.Fatalf("stored %d messages, want 2", len(stored))
	}
	if stored[0].Role != RoleUser || stored[0].Content != "What is the question?" {
		t.Fatalf("first turn = %+v", stored[0])
	}
	if !reflect.DeepEqual(stored[1], final) {
		t.Fatalf("done event = %+v, stored = %+v", final, stored[1])
	}
	if stored[1].Status != StatusOK || stored[1].ErrorMessage != "" {
		t.Fatalf("reply status = %q / %q, want ok and no error",
			stored[1].Status, stored[1].ErrorMessage)
	}
	if stored[1].Model != "test-model" || stored[1].Wire != "openai" {
		t.Fatalf("reply attributed to %q / %q", stored[1].Wire, stored[1].Model)
	}
}

// The conversation is asked about, not just the latest message: a chat that
// forgot the previous turn would answer every question as though it were first.
func TestSendAsksWithTheWholeTranscript(t *testing.T) {
	fake := llmtest.Streamed("second reply", 1)
	fake.Turns = append([]llmtest.Turn{{Text: "first reply", Stop: llm.StopEnd}}, fake.Turns...)

	handler, repo := newHandler(t, fake, nil)
	conversation := newConversation(t, repo)

	send(t, handler, conversation.ID, "first question")
	send(t, handler, conversation.ID, "second question")

	if len(fake.Requests) != 2 {
		t.Fatalf("asked the model %d times, want 2", len(fake.Requests))
	}

	second := fake.Requests[1]
	if second.SystemPrompt == "" {
		t.Fatal("the second request carried no system prompt")
	}

	said := []string{}
	for _, message := range second.Messages {
		said = append(said, string(message.Role)+":"+message.Content[0].Text)
	}

	want := []string{"user:first question", "assistant:first reply", "user:second question"}
	if strings.Join(said, "|") != strings.Join(want, "|") {
		t.Fatalf("second request carried %v, want %v", said, want)
	}
}

// A stream that dies part-way has left real text behind. Keeping it is what
// makes the failure recoverable; discarding it would lose the answer while
// keeping the question.
func TestSendKeepsPartialTextWhenTheStreamFails(t *testing.T) {
	fake := &llmtest.StreamingFake{
		Fake: llmtest.Fake{Turns: []llmtest.Turn{{
			Text: "half an answer",
			Err:  &llm.APIError{StatusCode: http.StatusTooManyRequests, Body: "slow down"},
		}}},
		Chunks: 2,
	}

	handler, repo := newHandler(t, fake, nil)
	conversation := newConversation(t, repo)

	recorder := send(t, handler, conversation.ID, "a question")

	// Still a 200: the status line went out before the model was asked, and the
	// failure is reported inside the stream because that is where it happened.
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", recorder.Code)
	}

	var final Message
	lastData(t, parseEvents(t, recorder.Body.String()), &final)

	if final.Content != "half an answer" {
		t.Fatalf("kept %q, want the text that arrived before the failure", final.Content)
	}
	if final.Status != StatusFailed {
		t.Fatalf("status = %q, want %q", final.Status, StatusFailed)
	}
	if !strings.Contains(final.ErrorMessage, "429") {
		t.Fatalf("error message = %q, want the provider's own verdict", final.ErrorMessage)
	}

	stored, err := repo.Messages(conversation.ID)
	if err != nil {
		t.Fatalf("Messages: %v", err)
	}
	if len(stored) != 2 || !reflect.DeepEqual(stored[1], final) {
		t.Fatalf("stored = %+v, done event = %+v", stored, final)
	}
}

// An endpoint that cannot stream is not a broken one. The reply arrives whole,
// as a single delta, so the client's code is the same either way.
func TestSendFallsBackToOneWholeAnswer(t *testing.T) {
	handler, repo := newHandler(t, llmtest.Text("all at once"), nil)
	conversation := newConversation(t, repo)

	recorder := send(t, handler, conversation.ID, "a question")
	events := parseEvents(t, recorder.Body.String())

	if got := names(events); strings.Join(got, ",") != strings.Join(
		[]string{EventStart, EventDelta, EventDone}, ",") {
		t.Fatalf("events = %v, want one delta between start and done", got)
	}

	var final Message
	lastData(t, events, &final)
	if final.Content != "all at once" || final.Status != StatusOK {
		t.Fatalf("final = %+v", final)
	}
}

// Nothing is written until the request is known to be answerable. A question
// stored against an unconfigured provider would sit in the transcript waiting
// for a reply that was never going to come.
func TestSendStoresNothingWhenThereIsNoProvider(t *testing.T) {
	handler, repo := newHandler(t, nil, llm.ErrNotConfigured)
	conversation := newConversation(t, repo)

	recorder := send(t, handler, conversation.ID, "a question")

	if recorder.Code != http.StatusPreconditionRequired {
		t.Fatalf("status = %d, want 428", recorder.Code)
	}
	if contentType := recorder.Header().Get("Content-Type"); strings.HasPrefix(contentType, "text/event-stream") {
		t.Fatal("a refusal was sent as a stream")
	}

	stored, err := repo.Messages(conversation.ID)
	if err != nil {
		t.Fatalf("Messages: %v", err)
	}
	if len(stored) != 0 {
		t.Fatalf("stored %d messages, want none", len(stored))
	}
}

func TestSendRejectsAnEmptyMessage(t *testing.T) {
	fake := llmtest.Streamed("unreachable", 1)
	handler, repo := newHandler(t, fake, nil)
	conversation := newConversation(t, repo)

	recorder := send(t, handler, conversation.ID, "   \n  ")

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", recorder.Code)
	}
	if fake.Calls() != 0 {
		t.Fatal("the model was asked about an empty message")
	}

	stored, _ := repo.Messages(conversation.ID)
	if len(stored) != 0 {
		t.Fatalf("stored %d messages, want none", len(stored))
	}
}

func TestSendToAMissingConversationIsNotFound(t *testing.T) {
	fake := llmtest.Streamed("unreachable", 1)
	handler, _ := newHandler(t, fake, nil)

	recorder := send(t, handler, "no-such-conversation", "a question")

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", recorder.Code)
	}
	if fake.Calls() != 0 {
		t.Fatal("the model was asked about a conversation that does not exist")
	}
}

func TestConversationRoutes(t *testing.T) {
	handler, repo := newHandler(t, llmtest.Text("hello"), nil)

	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	do := func(method, target, body string) *httptest.ResponseRecorder {
		t.Helper()

		request := httptest.NewRequest(method, target, strings.NewReader(body))
		recorder := httptest.NewRecorder()
		mux.ServeHTTP(recorder, request)

		return recorder
	}

	created := do(http.MethodPost, "/api/chats", `{"workspaceId":"ws-1"}`)
	if created.Code != http.StatusCreated {
		t.Fatalf("create status = %d, want 201", created.Code)
	}

	var conversation Conversation
	if err := json.Unmarshal(created.Body.Bytes(), &conversation); err != nil {
		t.Fatalf("decode created conversation: %v", err)
	}

	if listed := do(http.MethodGet, "/api/chats?workspaceId=ws-1", ""); listed.Code != http.StatusOK {
		t.Fatalf("list status = %d, want 200", listed.Code)
	}

	// Without a workspace the list would be every conversation on the machine,
	// which is not a thing any screen should be able to ask for by accident.
	if listed := do(http.MethodGet, "/api/chats", ""); listed.Code != http.StatusBadRequest {
		t.Fatalf("list without a workspace = %d, want 400", listed.Code)
	}

	send(t, handler, conversation.ID, "a question")

	detail := do(http.MethodGet, "/api/chats/"+conversation.ID, "")
	if detail.Code != http.StatusOK {
		t.Fatalf("detail status = %d, want 200", detail.Code)
	}

	var read ConversationDetail
	if err := json.Unmarshal(detail.Body.Bytes(), &read); err != nil {
		t.Fatalf("decode detail: %v", err)
	}
	if len(read.Messages) != 2 {
		t.Fatalf("detail carried %d messages, want 2", len(read.Messages))
	}
	if read.Title != "a question" {
		t.Fatalf("title = %q, want it derived from the first turn", read.Title)
	}

	renamed := do(http.MethodPatch, "/api/chats/"+conversation.ID, `{"title":"A better name"}`)
	if renamed.Code != http.StatusOK {
		t.Fatalf("rename status = %d, want 200", renamed.Code)
	}

	deleted := do(http.MethodDelete, "/api/chats/"+conversation.ID, "")
	if deleted.Code != http.StatusNoContent {
		t.Fatalf("delete status = %d, want 204", deleted.Code)
	}

	gone := do(http.MethodGet, "/api/chats/"+conversation.ID, "")
	if gone.Code != http.StatusNotFound {
		t.Fatalf("detail after delete = %d, want 404", gone.Code)
	}

	if _, err := repo.Messages(conversation.ID); err != nil {
		t.Fatalf("Messages after delete: %v", err)
	}
}

// A reader who stops reading stops the work. Nobody is waiting, and a local
// model asked to keep generating for a closed window is spending the machine's
// own resources on nothing.
//
// The turn is recorded as stopped rather than failed. Pressing stop and closing
// the window are the same event from here — the reader stopped reading — and
// neither is the model getting something wrong.
func TestSendRecordsAStoppedReplyRatherThanAFailedOne(t *testing.T) {
	fake := llmtest.Streamed("one two three four", 4)
	handler, repo := newHandler(t, fake, nil)
	conversation := newConversation(t, repo)

	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api/chats/"+conversation.ID+"/messages",
		strings.NewReader(`{"content":"a question"}`),
	)

	// Cancelled before the handler runs, which is the same thing the handler
	// sees when a window closes half a second in: a context that is already done
	// by the time the next chunk arrives.
	ctx, cancel := context.WithCancel(request.Context())
	cancel()

	mux.ServeHTTP(httptest.NewRecorder(), request.WithContext(ctx))

	if fake.Calls() != 1 {
		t.Fatalf("asked the model %d times, want 1", fake.Calls())
	}

	stored, err := repo.Messages(conversation.ID)
	if err != nil {
		t.Fatalf("Messages: %v", err)
	}
	if len(stored) != 2 {
		t.Fatalf("stored %d messages, want the question and a stopped reply", len(stored))
	}
	if stored[1].Status != StatusStopped {
		t.Fatalf("reply status = %q, want %q", stored[1].Status, StatusStopped)
	}

	// Nothing reached the client, so nothing is claimed to have. The response
	// the fake would have returned whole is not written down as an answer the
	// user was given.
	if stored[1].Content != "" {
		t.Fatalf("kept %q from a stream nobody read", stored[1].Content)
	}

	// No error message, because there was no error. A cancellation reported as
	// one would put "context canceled" in front of someone who pressed stop.
	if stored[1].ErrorMessage != "" {
		t.Fatalf("error message = %q, want none on a stopped reply", stored[1].ErrorMessage)
	}
}

// stubTool answers however the test needs and remembers that it ran.
type stubTool struct {
	name   string
	answer string
	runs   int
}

func (s *stubTool) Definition() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name:        s.name,
		Description: "a tool, for testing",
		Schema:      json.RawMessage(`{"type":"object"}`),
	}
}

func (s *stubTool) Run(context.Context, json.RawMessage) (string, error) {
	s.runs++

	return s.answer, nil
}

func withTools(t *testing.T, client llm.Client, tool agent.Tool) (*Handler, *Repository) {
	t.Helper()

	handler, repo := newHandler(t, client, nil)
	handler.WithTools(func(string) []agent.Tool { return []agent.Tool{tool} })

	return handler, repo
}

// A turn where the model looks something up: the tool runs, the stream says so
// while it happens, and the transcript keeps the record of it.
func TestATurnThatUsesAToolSaysSoAndKeepsTheRecord(t *testing.T) {
	search := &stubTool{name: "search_notes", answer: "Parser recovery strategy.md"}
	model := llmtest.Sequence(
		llmtest.Turn{Text: "Let me look. ", Calls: llmtest.ToolCall("call-1", "search_notes", `{"query":"parser"}`).Calls},
		llmtest.Turn{Text: "You wrote about parser recovery.", Stop: llm.StopEnd},
	)

	handler, repo := withTools(t, model, search)
	conversation := newConversation(t, repo)

	recorder := send(t, handler, conversation.ID, "what did I write about parsers?")
	events := parseEvents(t, recorder.Body.String())

	if search.runs != 1 {
		t.Fatalf("the tool ran %d times, want 1", search.runs)
	}

	// The reader is told what is happening while it happens, not afterwards.
	var announced ToolEvent
	found := false
	for _, e := range events {
		if e.name != EventTool {
			continue
		}
		found = true
		if err := json.Unmarshal([]byte(e.data), &announced); err != nil {
			t.Fatalf("decode tool event: %v", err)
		}
	}
	if !found {
		t.Fatalf("no tool event in %v", names(events))
	}
	if announced.Name != "search_notes" || announced.Input != `{"query":"parser"}` {
		t.Errorf("announced %+v", announced)
	}

	var final Message
	lastData(t, events, &final)

	if final.Content != "Let me look. You wrote about parser recovery." {
		t.Errorf("content = %q", final.Content)
	}
	// The question this app has to be able to answer about itself is "did it
	// read my notes?", and an answer that only exists in the stream disappears
	// on reload.
	if len(final.ToolCalls) != 1 || final.ToolCalls[0].Name != "search_notes" {
		t.Fatalf("tool calls = %+v", final.ToolCalls)
	}
	if final.ToolCalls[0].Input != `{"query":"parser"}` {
		t.Errorf("the arguments were not kept: %+v", final.ToolCalls[0])
	}

	// The model's own id for the call, and what the tool told it. Neither is
	// for the reader — nobody wants to look at a call id — but together they
	// are what lets this turn be read back to a model on the next one, which
	// nothing else in the transcript can supply.
	if final.ToolCalls[0].ID != "call-1" {
		t.Errorf("the call's id was not kept: %+v", final.ToolCalls[0])
	}
	if final.ToolCalls[0].Output != "Parser recovery strategy.md" {
		t.Errorf("what the model was told was not kept: %+v", final.ToolCalls[0])
	}
	if final.ToolCalls[0].Status != ToolCallOK {
		t.Errorf("status = %q, want %q", final.ToolCalls[0].Status, ToolCallOK)
	}

	stored, err := repo.Messages(conversation.ID)
	if err != nil {
		t.Fatalf("Messages: %v", err)
	}
	if !reflect.DeepEqual(stored[1], final) {
		t.Fatalf("done event = %+v, stored = %+v", final, stored[1])
	}
}

// A model still looking things up when the bound runs out has not answered the
// question, and whatever it had said by then is not the answer.
func TestARunThatRanOutOfStepsIsMarkedFailed(t *testing.T) {
	search := &stubTool{name: "search_notes", answer: "still nothing"}

	turns := make([]llmtest.Turn, 20)
	for index := range turns {
		turns[index] = llmtest.ToolCall("call", "search_notes", `{"query":"x"}`)
	}

	handler, repo := withTools(t, llmtest.Sequence(turns...), search)
	conversation := newConversation(t, repo)

	recorder := send(t, handler, conversation.ID, "a question")

	var final Message
	lastData(t, parseEvents(t, recorder.Body.String()), &final)

	if final.Status != StatusFailed {
		t.Fatalf("status = %q, want %q", final.Status, StatusFailed)
	}
	if !strings.Contains(final.ErrorMessage, "looking things up") {
		t.Errorf("error message = %q", final.ErrorMessage)
	}
	// Every step it took is on the record, not just the last.
	if len(final.ToolCalls) == 0 {
		t.Error("the steps it did take were not kept")
	}
}

// A build with no tools wired up offers none and answers from the conversation
// alone, rather than failing.
func TestAHandlerWithNoToolsStillAnswers(t *testing.T) {
	handler, repo := newHandler(t, llmtest.Text("no tools here"), nil)
	conversation := newConversation(t, repo)

	recorder := send(t, handler, conversation.ID, "a question")

	var final Message
	lastData(t, parseEvents(t, recorder.Body.String()), &final)

	if final.Content != "no tools here" || final.Status != StatusOK {
		t.Errorf("final = %+v", final)
	}
	if len(final.ToolCalls) != 0 {
		t.Errorf("tool calls = %+v", final.ToolCalls)
	}
}

// stopsPartway streams a piece, ends the request, then tries to stream another
// — which is what pressing stop looks like from inside the handler.
type stopsPartway struct {
	cancel context.CancelFunc
}

func (s *stopsPartway) Complete(context.Context, llm.Context, llm.Options) (llm.Response, error) {
	return llm.Response{}, nil
}

func (s *stopsPartway) Stream(
	_ context.Context, _ llm.Context, _ llm.Options, onText func(string) error,
) (llm.Response, error) {
	if err := onText("Half an answer"); err != nil {
		return llm.Response{}, err
	}

	s.cancel()

	if err := onText(" and the rest of it"); err != nil {
		return llm.Response{}, err
	}

	return llm.Response{}, nil
}

// Stopping keeps what had already been said. The reader watched those words
// arrive; a transcript that dropped them would be missing the only part of the
// turn that ever existed.
func TestAStoppedReplyKeepsTheTextThatArrived(t *testing.T) {
	handler, repo := newHandler(t, nil, nil)
	conversation := newConversation(t, repo)

	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api/chats/"+conversation.ID+"/messages",
		strings.NewReader(`{"content":"a question"}`),
	)
	ctx, cancel := context.WithCancel(request.Context())
	handler.newClient = func() (llm.Client, error) { return &stopsPartway{cancel: cancel}, nil }

	recorder := httptest.NewRecorder()
	mux.ServeHTTP(recorder, request.WithContext(ctx))

	stored, err := repo.Messages(conversation.ID)
	if err != nil {
		t.Fatalf("Messages: %v", err)
	}
	if len(stored) != 2 {
		t.Fatalf("stored %d messages, want 2", len(stored))
	}
	if stored[1].Status != StatusStopped {
		t.Fatalf("status = %q, want %q", stored[1].Status, StatusStopped)
	}
	if stored[1].Content != "Half an answer" {
		t.Fatalf("kept %q, want the words that arrived before the stop", stored[1].Content)
	}
	// Not the piece that came after it: the reader never saw that one.
	if strings.Contains(stored[1].Content, "the rest of it") {
		t.Errorf("kept text written after the stop: %q", stored[1].Content)
	}
}
