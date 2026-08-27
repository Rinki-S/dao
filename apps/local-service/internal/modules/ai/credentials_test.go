package ai

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"slices"
	"sync"
	"testing"

	"github.com/rinki-s/dao/apps/local-service/internal/ai/llm"
)

// applied runs a credential against a request and reports the headers it set.
func applied(t *testing.T, credential llm.Credential) http.Header {
	t.Helper()

	request := httptest.NewRequest(http.MethodPost, "http://example.test", nil)
	if err := credential.Apply(t.Context(), request); err != nil {
		t.Fatalf("apply: %v", err)
	}

	return request.Header
}

func TestCredentialKindDecidesHowTheSecretIsPresented(t *testing.T) {
	t.Run("a key goes in the header the wire expects", func(t *testing.T) {
		credentials := NewCredentials(KindAPIKey, "sk-1")

		if got := applied(t, credentials.Credential(llm.WireAnthropic)).Get("x-api-key"); got != "sk-1" {
			t.Errorf("anthropic x-api-key = %q", got)
		}
		if got := applied(t, credentials.Credential(llm.WireOpenAI)).Get("authorization"); got != "Bearer sk-1" {
			t.Errorf("openai authorization = %q", got)
		}
	})

	// An access token is a bearer token on both wires — the wire decides how a
	// key is carried, not how a token is.
	t.Run("a token is a bearer token on either wire", func(t *testing.T) {
		credentials := NewCredentials(KindOAuthToken, "at-1")

		for _, wire := range []llm.Wire{llm.WireAnthropic, llm.WireOpenAI} {
			headers := applied(t, credentials.Credential(wire))

			if got := headers.Get("authorization"); got != "Bearer at-1" {
				t.Errorf("%s authorization = %q", wire, got)
			}
			if got := headers.Get("x-api-key"); got != "" {
				t.Errorf("%s sent x-api-key = %q, want none", wire, got)
			}
		}
	})
}

// The token this process holds has no expiry and no refresher, because
// renewing belongs to the process that owns the refresh token. TokenSource
// must therefore hand it back rather than trying to renew something it has no
// means of renewing.
func TestAPushedTokenIsUsedRatherThanRenewed(t *testing.T) {
	credentials := NewCredentials(KindOAuthToken, "at-1")

	for range 3 {
		if got := applied(t, credentials.Credential(llm.WireOpenAI)).Get("authorization"); got != "Bearer at-1" {
			t.Fatalf("authorization = %q, want the pushed token every time", got)
		}
	}
}

func TestNoCredentialIsNotACredential(t *testing.T) {
	credentials := NewCredentials("", "")

	if credentials.Present() {
		t.Error("Present() = true with nothing held")
	}
	if credentials.Credential(llm.WireOpenAI) != nil {
		t.Error("built a credential out of nothing")
	}
}

// Anything written before kinds were named could only have been a key.
func TestASecretWithNoKindIsAKey(t *testing.T) {
	credentials := NewCredentials("", "sk-legacy")

	if kind, _ := credentials.Get(); kind != KindAPIKey {
		t.Errorf("kind = %q, want %q", kind, KindAPIKey)
	}
}

// Set is called by one request handler while others are reading, which is the
// entire reason this type has a lock rather than being two string fields.
func TestConcurrentReplacementIsSafe(t *testing.T) {
	credentials := NewCredentials(KindOAuthToken, "at-0")

	var wg sync.WaitGroup
	for i := range 16 {
		wg.Add(2)
		go func() { defer wg.Done(); credentials.Set(KindOAuthToken, "at-"+string(rune('a'+i))) }()
		go func() { defer wg.Done(); _ = credentials.Credential(llm.WireOpenAI) }()
	}
	wg.Wait()

	if !credentials.Present() {
		t.Error("lost the credential")
	}
}

func TestUpdateCredentialEndpoint(t *testing.T) {
	newHandler := func(t *testing.T) (*Handler, *Credentials) {
		t.Helper()

		repo := NewRepository(openTestDB(t))
		if _, err := repo.Set(validRequest(), true); err != nil {
			t.Fatalf("Set: %v", err)
		}

		credentials := NewCredentials(KindAPIKey, "sk-old")
		return NewHandler(repo, credentials), credentials
	}

	send := func(t *testing.T, handler *Handler, body string) *httptest.ResponseRecorder {
		t.Helper()

		mux := http.NewServeMux()
		handler.RegisterRoutes(mux)

		recorder := httptest.NewRecorder()
		mux.ServeHTTP(recorder, httptest.NewRequest(
			http.MethodPut, "/api/ai/credential", bytes.NewBufferString(body),
		))

		return recorder
	}

	t.Run("replaces the secret in use", func(t *testing.T) {
		handler, credentials := newHandler(t)

		recorder := send(t, handler, `{"kind":"oauth-token","secret":"at-new"}`)
		if recorder.Code != http.StatusOK {
			t.Fatalf("status = %d: %s", recorder.Code, recorder.Body)
		}

		kind, secret := credentials.Get()
		if kind != KindOAuthToken || secret != "at-new" {
			t.Errorf("held %q/%q after the update", kind, secret)
		}
	})

	// An endpoint that echoes back what it was just sent turns a write-only
	// store into a readable one.
	t.Run("does not echo the secret back", func(t *testing.T) {
		handler, _ := newHandler(t)

		recorder := send(t, handler, `{"kind":"oauth-token","secret":"at-secret"}`)

		if bytes.Contains(recorder.Body.Bytes(), []byte("at-secret")) {
			t.Errorf("the response carried the secret: %s", recorder.Body)
		}

		var settings ProviderSettings
		if err := json.Unmarshal(recorder.Body.Bytes(), &settings); err != nil {
			t.Fatalf("response was not settings: %v", err)
		}
		if !settings.KeyPresent {
			t.Error("keyPresent = false after storing one")
		}
	})

	t.Run("an empty secret disconnects", func(t *testing.T) {
		handler, credentials := newHandler(t)

		recorder := send(t, handler, `{"kind":"","secret":""}`)
		if recorder.Code != http.StatusOK {
			t.Fatalf("status = %d: %s", recorder.Code, recorder.Body)
		}
		if credentials.Present() {
			t.Error("still holding a credential after being told to drop it")
		}
	})

	for _, testCase := range []struct{ name, body string }{
		{"an unknown kind", `{"kind":"saml","secret":"x"}`},
		{"a secret with no kind", `{"secret":"x"}`},
		{"not JSON", `nonsense`},
	} {
		t.Run(testCase.name+" is refused", func(t *testing.T) {
			handler, credentials := newHandler(t)

			if recorder := send(t, handler, testCase.body); recorder.Code != http.StatusBadRequest {
				t.Errorf("status = %d, want 400", recorder.Code)
			}

			// A refused update must leave the working credential alone.
			if _, secret := credentials.Get(); secret != "sk-old" {
				t.Errorf("held %q, want the previous credential untouched", secret)
			}
		})
	}
}

// The link the endpoint exists for: a credential pushed at runtime has to
// change what the next outgoing request carries. Everything else about the
// push is bookkeeping if this does not hold.
func TestAPushedCredentialChangesTheNextRequest(t *testing.T) {
	var seen []string

	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = append(seen, r.Header.Get("authorization"))
		w.Header().Set("content-type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"ok"},"finish_reason":"stop"}]}`))
	}))
	defer provider.Close()

	repo := NewRepository(openTestDB(t))
	if _, err := repo.Set(UpdateProviderSettingsRequest{
		Wire: "openai", BaseURL: provider.URL, Model: "m",
	}, true); err != nil {
		t.Fatalf("Set: %v", err)
	}

	credentials := NewCredentials(KindOAuthToken, "at-1")
	handler := NewHandler(repo, credentials)

	call := func() {
		t.Helper()

		client, err := handler.Client()
		if err != nil {
			t.Fatalf("Client: %v", err)
		}
		if _, err := client.Complete(t.Context(),
			llm.Context{Messages: []llm.Message{llm.UserText("x")}},
			llm.Options{MaxTokens: 16},
		); err != nil {
			t.Fatalf("Complete: %v", err)
		}
	}

	call()

	// What the desktop process does after renewing.
	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)
	recorder := httptest.NewRecorder()
	mux.ServeHTTP(recorder, httptest.NewRequest(
		http.MethodPut, "/api/ai/credential",
		bytes.NewBufferString(`{"kind":"oauth-token","secret":"at-2"}`),
	))
	if recorder.Code != http.StatusOK {
		t.Fatalf("push: status %d", recorder.Code)
	}

	call()

	if want := []string{"Bearer at-1", "Bearer at-2"}; !slices.Equal(seen, want) {
		t.Errorf("provider saw %v, want %v", seen, want)
	}
}

// The distinction the "none" kind exists to make: an endpoint that wants
// nothing is set up, and an empty form is not. Both hold no secret, so nothing
// but the kind can tell them apart.
func TestAnEndpointThatNeedsNothingIsStillConfigured(t *testing.T) {
	credentials := NewCredentials(KindNone, "")

	if !credentials.Present() {
		t.Error("Present() = false, so a working local model would be reported as unconfigured")
	}

	credential := credentials.Credential(llm.WireOpenAI)
	if credential == nil {
		t.Fatal("built no credential, so llm.Config would fail to validate")
	}

	// The point of the kind: the request goes out bare.
	for _, header := range []string{"authorization", "x-api-key"} {
		if got := applied(t, credential).Get(header); got != "" {
			t.Errorf("%s = %q, want nothing sent to a server that asked for nothing", header, got)
		}
	}
}

// A secret alongside "needs nothing" is contradictory, and the resolution that
// matters is the one that never puts a paid key on the wire to localhost.
func TestKindNoneRefusesASecret(t *testing.T) {
	repo := NewRepository(openTestDB(t))
	if _, err := repo.Set(validRequest(), true); err != nil {
		t.Fatalf("Set: %v", err)
	}

	credentials := NewCredentials(KindAPIKey, "sk-old")
	mux := http.NewServeMux()
	NewHandler(repo, credentials).RegisterRoutes(mux)

	recorder := httptest.NewRecorder()
	mux.ServeHTTP(recorder, httptest.NewRequest(
		http.MethodPut, "/api/ai/credential",
		bytes.NewBufferString(`{"kind":"none","secret":"sk-paid"}`),
	))

	if recorder.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", recorder.Code)
	}
	if _, secret := credentials.Get(); secret != "sk-old" {
		t.Errorf("held %q, want the previous credential untouched", secret)
	}
}
