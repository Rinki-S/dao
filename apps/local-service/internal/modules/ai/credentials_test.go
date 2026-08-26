package ai

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
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
