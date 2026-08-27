package llm

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"sync"
	"time"
)

// A credential is not a string.
//
// It looks like one when the only kind you support is an API key: a fixed
// secret that goes in a fixed header and never changes. But a token has a
// lifetime, and reading it may mean renewing it first — a network call that
// can fail. That is why this is an interface with a context and an error
// rather than a field: both of those are unrepresentable in a string.
type Credential interface {
	// Apply attaches authentication to an outgoing request. It may perform a
	// network call to renew an expired token before doing so.
	Apply(ctx context.Context, request *http.Request) error
}

var (
	ErrNoCredential      = errors.New("no credential")
	ErrCredentialExpired = errors.New("credential expired and could not be renewed")
)

// APIKey authenticates with a fixed secret. Which header it goes in is the
// wire's business, not the key's: the same key string is "x-api-key" on the
// Anthropic wire and "authorization: Bearer" on the OpenAI one.
type APIKey struct {
	Wire Wire
	Key  string
}

func (k APIKey) Apply(_ context.Context, request *http.Request) error {
	if k.Key == "" {
		return ErrNoCredential
	}

	switch k.Wire {
	case WireAnthropic:
		request.Header.Set("x-api-key", k.Key)
	case WireOpenAI:
		request.Header.Set("authorization", "Bearer "+k.Key)
	default:
		return fmt.Errorf("%w: %q", ErrUnknownWire, k.Wire)
	}

	return nil
}

// Anonymous authenticates nothing, for an endpoint that asks for nothing.
//
// A model running on the machine has no account behind it, so there is no
// secret to send. That is a real kind of credential rather than a missing one,
// and saying so here is what keeps the absence from having to be special-cased
// everywhere a credential is required: Validate sees a credential, Apply
// attaches no header, and the request goes out as the local server expects it.
//
// It is deliberately not the zero value of anything. Reaching this state takes
// a caller that meant it, which is what stops a forgotten key from quietly
// becoming an unauthenticated call to a paid endpoint.
type Anonymous struct{}

func (Anonymous) Apply(context.Context, *http.Request) error { return nil }

// Token is an OAuth credential: a short-lived key, the longer-lived one that
// buys a replacement, and the moment the first stops working.
type Token struct {
	Access  string
	Refresh string
	Expires time.Time
}

// refreshSkew renews slightly early. A token that is valid when checked can
// still be expired by the time the request reaches the provider, and the
// failure that produces is a 401 that looks exactly like a bad credential.
const refreshSkew = 60 * time.Second

func (t Token) Stale(now time.Time) bool {
	if t.Access == "" {
		return true
	}
	// A token with no stated expiry is taken at face value: some providers
	// issue them, and guessing an expiry would renew perfectly good tokens.
	if t.Expires.IsZero() {
		return false
	}
	return !now.Before(t.Expires.Add(-refreshSkew))
}

// Refresher exchanges a refresh token for a new one. It is the only part of
// OAuth that differs per provider once a token has been obtained, which is
// why it is the only part this package asks for.
type Refresher interface {
	Refresh(ctx context.Context, refreshToken string) (Token, error)
}

// TokenSource holds an OAuth token and renews it when it goes stale.
//
// The mutex is not defensive tidiness. Refresh tokens usually *rotate*: the
// provider hands back a new refresh token and immediately invalidates the one
// you presented. So if two requests notice the same expired token and both
// renew, the second presents a token the first already consumed — that call
// fails, and depending on which result is written last, the stored credential
// can end up being the dead one. Serialising renewal is what makes the
// rotation safe, and re-checking staleness inside the lock is what stops the
// second caller renewing again after the first already did.
type TokenSource struct {
	mu        sync.Mutex
	token     Token
	refresher Refresher
	// persist is a callback rather than a store interface: this package should
	// not know whether a token lives in SQLite, a file, or the OS keychain.
	persist func(Token) error
	now     func() time.Time
}

func NewTokenSource(token Token, refresher Refresher, persist func(Token) error) *TokenSource {
	return &TokenSource{token: token, refresher: refresher, persist: persist}
}

func (s *TokenSource) clock() time.Time {
	if s.now != nil {
		return s.now()
	}
	return time.Now()
}

// Token returns a usable access token, renewing first if the held one is
// stale.
func (s *TokenSource) Token(ctx context.Context) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Re-checked under the lock: a caller that queued behind a renewal must
	// use its result rather than start another one.
	if !s.token.Stale(s.clock()) {
		return s.token.Access, nil
	}
	if s.token.Refresh == "" || s.refresher == nil {
		return "", ErrCredentialExpired
	}

	renewed, err := s.refresher.Refresh(ctx, s.token.Refresh)
	if err != nil {
		return "", fmt.Errorf("%w: %w", ErrCredentialExpired, err)
	}
	// A provider that rotates only the access token leaves this field empty.
	// Dropping the refresh token in that case would strand the credential.
	if renewed.Refresh == "" {
		renewed.Refresh = s.token.Refresh
	}

	s.token = renewed

	// Written before the token is handed out. If persisting fails the process
	// still holds a working token, but the next start would find the consumed
	// one on disk, so this is reported rather than swallowed.
	if s.persist != nil {
		if err := s.persist(renewed); err != nil {
			return "", fmt.Errorf("could not store renewed token: %w", err)
		}
	}

	return renewed.Access, nil
}

// BearerToken authenticates with an OAuth token, renewing it when needed.
// Both wires carry it the same way, so unlike APIKey it does not branch.
type BearerToken struct {
	Source *TokenSource
	// Headers are sent alongside the token. OAuth-issued credentials are
	// often scoped to a particular client, which identifies itself this way.
	Headers map[string]string
}

func (b BearerToken) Apply(ctx context.Context, request *http.Request) error {
	if b.Source == nil {
		return ErrNoCredential
	}

	access, err := b.Source.Token(ctx)
	if err != nil {
		return err
	}

	request.Header.Set("authorization", "Bearer "+access)
	for name, value := range b.Headers {
		request.Header.Set(name, value)
	}

	return nil
}
