package llm

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

// A recording server stands in for the provider. The wire is the whole point
// of these tests: what matters is the exact JSON and headers that leave the
// process, because that is what a third-party endpoint will or will not accept.
type capture struct {
	path    string
	headers http.Header
	body    map[string]any
}

func serve(t *testing.T, status int, response string) (*httptest.Server, *capture) {
	t.Helper()
	recorded := &capture{}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		recorded.path = r.URL.Path
		recorded.headers = r.Header.Clone()

		raw, err := io.ReadAll(r.Body)
		if err != nil {
			t.Errorf("read request body: %v", err)
		}
		if err := json.Unmarshal(raw, &recorded.body); err != nil {
			t.Errorf("request body was not JSON: %v (%s)", err, raw)
		}

		w.WriteHeader(status)
		_, _ = w.Write([]byte(response))
	}))
	t.Cleanup(server.Close)

	return server, recorded
}

func newClient(t *testing.T, wire Wire, baseURL string) Client {
	t.Helper()
	client, err := New(Config{
		Wire:    wire,
		BaseURL: baseURL,
		APIKey:  "test-key",
		Model:   "test-model",
	}, nil)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	return client
}

func request() Context {
	return Context{
		SystemPrompt: "Be brief.",
		Messages:     []Message{UserText("What happened today?")},
	}
}

func TestAnthropicWire(t *testing.T) {
	server, recorded := serve(t, http.StatusOK, `{
		"content": [
			{"type": "thinking", "thinking": "weighing it up"},
			{"type": "text", "text": "You shipped the parser fix."}
		],
		"stop_reason": "end_turn",
		"usage": {"input_tokens": 120, "output_tokens": 8}
	}`)

	response, err := newClient(t, WireAnthropic, server.URL).
		Complete(context.Background(), request(), Options{MaxTokens: 512})
	if err != nil {
		t.Fatalf("Complete: %v", err)
	}

	if recorded.path != "/v1/messages" {
		t.Errorf("path = %q, want /v1/messages", recorded.path)
	}
	if got := recorded.headers.Get("x-api-key"); got != "test-key" {
		t.Errorf("x-api-key = %q", got)
	}
	if got := recorded.headers.Get("anthropic-version"); got != anthropicVersion {
		t.Errorf("anthropic-version = %q, want %q", got, anthropicVersion)
	}
	// The system prompt is a top-level field on this wire, not a message.
	if got := recorded.body["system"]; got != "Be brief." {
		t.Errorf("system = %v, want the system prompt", got)
	}
	if messages, ok := recorded.body["messages"].([]any); !ok || len(messages) != 1 {
		t.Errorf("messages = %v, want only the user turn", recorded.body["messages"])
	}

	if got := response.Text(); got != "You shipped the parser fix." {
		t.Errorf("Text() = %q", got)
	}
	// Text() leaves reasoning out, but the block itself survives on Content.
	if len(response.Content) != 2 || response.Content[0].Kind != KindThinking {
		t.Errorf("Content = %+v, want the thinking block kept", response.Content)
	}
	if response.Usage != (Usage{InputTokens: 120, OutputTokens: 8}) {
		t.Errorf("Usage = %+v", response.Usage)
	}
	if response.StopReason != StopEnd {
		t.Errorf("StopReason = %q", response.StopReason)
	}
}

func TestOpenAIWire(t *testing.T) {
	server, recorded := serve(t, http.StatusOK, `{
		"choices": [{"message": {"content": "You shipped the parser fix."}, "finish_reason": "stop"}],
		"usage": {"prompt_tokens": 120, "completion_tokens": 8}
	}`)

	response, err := newClient(t, WireOpenAI, server.URL).
		Complete(context.Background(), request(), Options{MaxTokens: 512})
	if err != nil {
		t.Fatalf("Complete: %v", err)
	}

	if recorded.path != "/v1/chat/completions" {
		t.Errorf("path = %q, want /v1/chat/completions", recorded.path)
	}
	if got := recorded.headers.Get("authorization"); got != "Bearer test-key" {
		t.Errorf("authorization = %q", got)
	}
	if _, exists := recorded.body["system"]; exists {
		t.Error("system was sent as a field; this wire carries it as a message")
	}

	messages, ok := recorded.body["messages"].([]any)
	if !ok || len(messages) != 2 {
		t.Fatalf("messages = %v, want the system turn ahead of the user turn", recorded.body["messages"])
	}
	if role := messages[0].(map[string]any)["role"]; role != "system" {
		t.Errorf("first message role = %v, want system", role)
	}

	if got := response.Text(); got != "You shipped the parser fix." {
		t.Errorf("Text() = %q", got)
	}
	if response.Usage != (Usage{InputTokens: 120, OutputTokens: 8}) {
		t.Errorf("Usage = %+v", response.Usage)
	}
}

func TestOpenAICapturesReasoning(t *testing.T) {
	server, _ := serve(t, http.StatusOK, `{
		"choices": [{"message": {
			"reasoning_content": "weighing it up",
			"content": "You shipped the parser fix."
		}, "finish_reason": "stop"}],
		"usage": {"prompt_tokens": 120, "completion_tokens": 8}
	}`)

	response, err := newClient(t, WireOpenAI, server.URL).
		Complete(context.Background(), request(), Options{MaxTokens: 512})
	if err != nil {
		t.Fatalf("Complete: %v", err)
	}

	if got := response.Text(); got != "You shipped the parser fix." {
		t.Errorf("Text() = %q, want reasoning left out", got)
	}
	if got := response.Thinking(); got != "weighing it up" {
		t.Errorf("Thinking() = %q", got)
	}
}

func TestBothWiresNormaliseTruncation(t *testing.T) {
	// A caller parsing JSON needs to tell "the model wrote nonsense" from "the
	// answer was cut off", and each wire spells the second one differently.
	cases := []struct {
		name     string
		wire     Wire
		response string
	}{
		{"anthropic", WireAnthropic, `{"content":[{"type":"text","text":"{\"a\":"}],"stop_reason":"max_tokens"}`},
		{"openai", WireOpenAI, `{"choices":[{"message":{"content":"{\"a\":"},"finish_reason":"length"}]}`},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			server, _ := serve(t, http.StatusOK, testCase.response)

			response, err := newClient(t, testCase.wire, server.URL).
				Complete(context.Background(), request(), Options{MaxTokens: 8})
			if err != nil {
				t.Fatalf("Complete: %v", err)
			}
			if response.StopReason != StopLength {
				t.Errorf("StopReason = %q, want %q", response.StopReason, StopLength)
			}
		})
	}
}

func TestRefusalKeepsTheStatus(t *testing.T) {
	// An unusable key, a rate limit and a rejected request all arrive as
	// non-200s, and the caller reports them very differently.
	for _, status := range []int{http.StatusUnauthorized, http.StatusTooManyRequests} {
		server, _ := serve(t, status, `{"error":{"message":"nope"}}`)

		_, err := newClient(t, WireOpenAI, server.URL).
			Complete(context.Background(), request(), Options{MaxTokens: 512})

		var apiError *APIError
		if !errors.As(err, &apiError) {
			t.Fatalf("error = %v, want an *APIError", err)
		}
		if apiError.StatusCode != status {
			t.Errorf("StatusCode = %d, want %d", apiError.StatusCode, status)
		}
	}
}

func TestCompatibleInNameOnlyIsAnError(t *testing.T) {
	// A 200 with no choices would otherwise become an empty answer, and the
	// caller would blame the model for writing invalid JSON.
	server, _ := serve(t, http.StatusOK, `{"choices":[],"usage":{"prompt_tokens":10}}`)

	response, err := newClient(t, WireOpenAI, server.URL).
		Complete(context.Background(), request(), Options{MaxTokens: 512})
	if err == nil {
		t.Fatal("want an error when the endpoint returns no choices")
	}
	if response.Usage.InputTokens != 10 {
		t.Errorf("Usage = %+v, want the tokens the failed call still spent", response.Usage)
	}
}

func TestNewRejectsIncompleteConfiguration(t *testing.T) {
	cases := []struct {
		name   string
		config Config
		want   error
	}{
		{"no key", Config{Wire: WireOpenAI, BaseURL: "https://x", Model: "m"}, ErrNotConfigured},
		{"no model", Config{Wire: WireOpenAI, BaseURL: "https://x", APIKey: "k"}, ErrNotConfigured},
		{"no base url", Config{Wire: WireOpenAI, APIKey: "k", Model: "m"}, ErrNotConfigured},
		{"unknown wire", Config{Wire: "gemini", BaseURL: "https://x", APIKey: "k", Model: "m"}, ErrUnknownWire},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			if _, err := New(testCase.config, nil); !errors.Is(err, testCase.want) {
				t.Errorf("New error = %v, want %v", err, testCase.want)
			}
		})
	}
}

func TestBaseURLToleratesATrailingSlash(t *testing.T) {
	server, recorded := serve(t, http.StatusOK,
		`{"choices":[{"message":{"content":"ok"},"finish_reason":"stop"}]}`)

	client, err := New(Config{
		Wire:    WireOpenAI,
		BaseURL: server.URL + "/",
		APIKey:  "test-key",
		Model:   "test-model",
	}, nil)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if _, err := client.Complete(context.Background(), request(), Options{MaxTokens: 16}); err != nil {
		t.Fatalf("Complete: %v", err)
	}

	// Someone will paste a URL with a trailing slash, and //v1/... is a 404.
	if recorded.path != "/v1/chat/completions" {
		t.Errorf("path = %q, want no doubled slash", recorded.path)
	}
}
