package chats

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

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
	if stored[1] != final {
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
	if len(stored) != 2 || stored[1] != final {
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

// A client that goes away stops the work. Nobody is reading, and a local model
// asked to keep generating for a closed window is spending the machine's own
// resources on nothing.
func TestSendStopsWhenTheClientDisconnects(t *testing.T) {
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
		t.Fatalf("stored %d messages, want the question and a failed reply", len(stored))
	}
	if stored[1].Status != StatusFailed {
		t.Fatalf("reply status = %q, want %q", stored[1].Status, StatusFailed)
	}

	// Nothing reached the client, so nothing is claimed to have. The response
	// the fake would have returned whole is not written down as an answer the
	// user was given.
	if stored[1].Content != "" {
		t.Fatalf("kept %q from a stream nobody read", stored[1].Content)
	}
	if !strings.Contains(stored[1].ErrorMessage, context.Canceled.Error()) {
		t.Fatalf("error message = %q, want the cancellation", stored[1].ErrorMessage)
	}
}
