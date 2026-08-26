package llm

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// countingRefresher records how many renewals it was asked for, which is the
// only way to see the difference between a correct and an incorrect lock.
type countingRefresher struct {
	calls atomic.Int64
	// seen is every refresh token presented, in order. Rotation means each one
	// may only ever be presented once.
	mu   sync.Mutex
	seen []string

	issue func(n int64, presented string) (Token, error)
}

func (r *countingRefresher) Refresh(_ context.Context, presented string) (Token, error) {
	n := r.calls.Add(1)

	r.mu.Lock()
	r.seen = append(r.seen, presented)
	r.mu.Unlock()

	if r.issue != nil {
		return r.issue(n, presented)
	}
	return Token{
		Access:  fmt.Sprintf("access-%d", n),
		Refresh: fmt.Sprintf("refresh-%d", n),
		Expires: time.Now().Add(time.Hour),
	}, nil
}

func TestAPIKeyHeaderDependsOnWire(t *testing.T) {
	for _, testCase := range []struct {
		wire   Wire
		header string
		want   string
	}{
		{WireAnthropic, "x-api-key", "secret"},
		{WireOpenAI, "authorization", "Bearer secret"},
	} {
		t.Run(string(testCase.wire), func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, "http://example.test", nil)

			if err := (APIKey{Wire: testCase.wire, Key: "secret"}).Apply(t.Context(), request); err != nil {
				t.Fatalf("apply: %v", err)
			}
			if got := request.Header.Get(testCase.header); got != testCase.want {
				t.Errorf("%s = %q, want %q", testCase.header, got, testCase.want)
			}
		})
	}
}

func TestAPIKeyRefusesEmptyKeyAndUnknownWire(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "http://example.test", nil)

	if err := (APIKey{Wire: WireOpenAI}).Apply(t.Context(), request); !errors.Is(err, ErrNoCredential) {
		t.Errorf("empty key: got %v, want ErrNoCredential", err)
	}
	if err := (APIKey{Wire: "cohere", Key: "k"}).Apply(t.Context(), request); !errors.Is(err, ErrUnknownWire) {
		t.Errorf("unknown wire: got %v, want ErrUnknownWire", err)
	}
}

func TestTokenStale(t *testing.T) {
	now := time.Date(2026, 8, 26, 12, 0, 0, 0, time.UTC)

	for _, testCase := range []struct {
		name  string
		token Token
		want  bool
	}{
		{"no access token", Token{Expires: now.Add(time.Hour)}, true},
		{"expires later", Token{Access: "a", Expires: now.Add(time.Hour)}, false},
		{"already expired", Token{Access: "a", Expires: now.Add(-time.Second)}, true},
		// The skew window is the point: still valid, renewed anyway, because
		// it may not survive the trip to the provider.
		{"inside the skew window", Token{Access: "a", Expires: now.Add(30 * time.Second)}, true},
		{"just outside the skew window", Token{Access: "a", Expires: now.Add(90 * time.Second)}, false},
		{"no stated expiry", Token{Access: "a"}, false},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			if got := testCase.token.Stale(now); got != testCase.want {
				t.Errorf("Stale() = %v, want %v", got, testCase.want)
			}
		})
	}
}

func TestTokenSourceDoesNotRenewAFreshToken(t *testing.T) {
	refresher := &countingRefresher{}
	source := NewTokenSource(
		Token{Access: "still-good", Refresh: "r", Expires: time.Now().Add(time.Hour)},
		refresher, nil,
	)

	access, err := source.Token(t.Context())
	if err != nil {
		t.Fatalf("Token: %v", err)
	}
	if access != "still-good" {
		t.Errorf("access = %q, want the held token", access)
	}
	if calls := refresher.calls.Load(); calls != 0 {
		t.Errorf("refreshed %d times, want 0", calls)
	}
}

func TestTokenSourceRenewsAndPersists(t *testing.T) {
	refresher := &countingRefresher{}

	var stored Token
	source := NewTokenSource(
		Token{Access: "expired", Refresh: "r0", Expires: time.Now().Add(-time.Hour)},
		refresher,
		func(renewed Token) error { stored = renewed; return nil },
	)

	access, err := source.Token(t.Context())
	if err != nil {
		t.Fatalf("Token: %v", err)
	}
	if access != "access-1" {
		t.Errorf("access = %q, want the renewed token", access)
	}
	if stored.Refresh != "refresh-1" {
		t.Errorf("stored refresh = %q, want the rotated one", stored.Refresh)
	}
}

// The reason TokenSource has a mutex at all.
//
// Refresh tokens rotate: presenting one consumes it. If concurrent callers
// each renew, every renewal after the first presents a token the provider has
// already invalidated. One refresh call is the whole assertion.
func TestConcurrentCallersRenewOnlyOnce(t *testing.T) {
	refresher := &countingRefresher{}
	source := NewTokenSource(
		Token{Access: "expired", Refresh: "r0", Expires: time.Now().Add(-time.Hour)},
		refresher, nil,
	)

	const callers = 32
	var start sync.WaitGroup
	var done sync.WaitGroup
	start.Add(1)

	results := make([]string, callers)
	errs := make([]error, callers)

	for i := range callers {
		done.Add(1)
		go func() {
			defer done.Done()
			start.Wait() // release everyone at once, to actually contend
			results[i], errs[i] = source.Token(t.Context())
		}()
	}

	start.Done()
	done.Wait()

	if calls := refresher.calls.Load(); calls != 1 {
		t.Errorf("refreshed %d times, want exactly 1", calls)
	}
	if len(refresher.seen) == 1 && refresher.seen[0] != "r0" {
		t.Errorf("presented %q, want the original refresh token", refresher.seen[0])
	}
	for i := range callers {
		if errs[i] != nil {
			t.Fatalf("caller %d: %v", i, errs[i])
		}
		if results[i] != "access-1" {
			t.Errorf("caller %d got %q, want every caller to share one renewal", i, results[i])
		}
	}
}

// Some providers rotate only the access token and say nothing about the
// refresh token. Taking the response literally would strand the credential.
func TestRenewalKeepsTheOldRefreshTokenWhenNoneIsReturned(t *testing.T) {
	refresher := &countingRefresher{
		issue: func(_ int64, _ string) (Token, error) {
			return Token{Access: "fresh", Expires: time.Now().Add(time.Hour)}, nil
		},
	}

	var stored Token
	source := NewTokenSource(
		Token{Access: "expired", Refresh: "keep-me", Expires: time.Now().Add(-time.Hour)},
		refresher,
		func(renewed Token) error { stored = renewed; return nil },
	)

	if _, err := source.Token(t.Context()); err != nil {
		t.Fatalf("Token: %v", err)
	}
	if stored.Refresh != "keep-me" {
		t.Errorf("stored refresh = %q, want the original to be kept", stored.Refresh)
	}
}

func TestTokenSourceReportsFailures(t *testing.T) {
	expired := func() Token {
		return Token{Access: "expired", Refresh: "r", Expires: time.Now().Add(-time.Hour)}
	}

	t.Run("nothing to renew with", func(t *testing.T) {
		source := NewTokenSource(Token{Access: "expired", Expires: time.Now().Add(-time.Hour)}, nil, nil)

		if _, err := source.Token(t.Context()); !errors.Is(err, ErrCredentialExpired) {
			t.Errorf("got %v, want ErrCredentialExpired", err)
		}
	})

	t.Run("the provider refused", func(t *testing.T) {
		refresher := &countingRefresher{
			issue: func(_ int64, _ string) (Token, error) { return Token{}, errors.New("invalid_grant") },
		}
		source := NewTokenSource(expired(), refresher, nil)

		if _, err := source.Token(t.Context()); !errors.Is(err, ErrCredentialExpired) {
			t.Errorf("got %v, want ErrCredentialExpired", err)
		}
	})

	// A renewal that cannot be written down is a renewal that is lost on the
	// next start, so it is reported rather than quietly succeeding.
	t.Run("the renewal could not be stored", func(t *testing.T) {
		source := NewTokenSource(expired(), &countingRefresher{},
			func(Token) error { return errors.New("disk full") })

		_, err := source.Token(t.Context())
		if err == nil {
			t.Fatal("want an error when the token could not be stored")
		}
	})
}

func TestBearerTokenAppliesTokenAndHeaders(t *testing.T) {
	source := NewTokenSource(
		Token{Access: "tok", Expires: time.Now().Add(time.Hour)}, nil, nil,
	)
	credential := BearerToken{Source: source, Headers: map[string]string{"x-client": "dao"}}

	request := httptest.NewRequest(http.MethodPost, "http://example.test", nil)
	if err := credential.Apply(t.Context(), request); err != nil {
		t.Fatalf("apply: %v", err)
	}

	if got := request.Header.Get("authorization"); got != "Bearer tok" {
		t.Errorf("authorization = %q", got)
	}
	if got := request.Header.Get("x-client"); got != "dao" {
		t.Errorf("x-client = %q", got)
	}
}

func TestBearerTokenWithoutASourceIsRefused(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "http://example.test", nil)

	if err := (BearerToken{}).Apply(t.Context(), request); !errors.Is(err, ErrNoCredential) {
		t.Errorf("got %v, want ErrNoCredential", err)
	}
}

// The credential reaches the provider through the wire clients, not just in
// isolation: an OAuth token must arrive as a Bearer header on both wires,
// including the Anthropic one that sends API keys as x-api-key.
func TestConfigCredentialOverridesAPIKeyOnBothWires(t *testing.T) {
	for _, testCase := range []struct {
		wire     Wire
		response string
	}{
		{WireAnthropic, `{"content":[{"type":"text","text":"hi"}],"stop_reason":"end_turn"}`},
		{WireOpenAI, `{"choices":[{"message":{"content":"hi"},"finish_reason":"stop"}]}`},
	} {
		t.Run(string(testCase.wire), func(t *testing.T) {
			server, recorded := serve(t, http.StatusOK, testCase.response)

			source := NewTokenSource(Token{Access: "oauth-tok", Expires: time.Now().Add(time.Hour)}, nil, nil)
			client, err := New(Config{
				Wire:       testCase.wire,
				BaseURL:    server.URL,
				Model:      "m",
				APIKey:     "should-be-ignored",
				Credential: BearerToken{Source: source},
			}, server.Client())
			if err != nil {
				t.Fatalf("New: %v", err)
			}

			if _, err := client.Complete(t.Context(),
				Context{Messages: []Message{UserText("x")}},
				Options{MaxTokens: 16},
			); err != nil {
				t.Fatalf("Complete: %v", err)
			}

			if got := recorded.headers.Get("authorization"); got != "Bearer oauth-tok" {
				t.Errorf("authorization = %q, want the OAuth token", got)
			}
			if got := recorded.headers.Get("x-api-key"); got != "" {
				t.Errorf("x-api-key = %q, want the key not to be sent", got)
			}
		})
	}
}
