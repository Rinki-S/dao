package ai

import (
	"sync"

	"github.com/rinki-s/dao/apps/local-service/internal/ai/llm"
)

// Credential kinds, matching what the desktop process stores.
const (
	KindAPIKey     = "api-key"
	KindOAuthToken = "oauth-token"
)

// Credentials is the secret this process was given, and whatever has replaced
// it since.
//
// It used to be a string field on the handler, fixed at startup, which was
// right while the only kind was an API key: a key does not change on its own,
// so a restart was a reasonable way to pick up a new one. An access token does
// change — roughly hourly — and restarting the service every hour to collect
// one is not a design.
//
// The desktop process owns the renewal, because it owns the keychain and the
// browser, and pushes each new access token here. That makes this a value read
// by request handlers and written by an unrelated one, so it needs a lock. The
// read side is much busier than the write side, hence RWMutex.
type Credentials struct {
	mu     sync.RWMutex
	kind   string
	secret string
}

func NewCredentials(kind, secret string) *Credentials {
	if secret != "" && kind == "" {
		// A secret with no stated kind is a key. Anything written by a version
		// that did not name kinds could only have been one.
		kind = KindAPIKey
	}
	return &Credentials{kind: kind, secret: secret}
}

func (c *Credentials) Set(kind, secret string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.kind, c.secret = kind, secret
}

func (c *Credentials) Get() (string, string) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	return c.kind, c.secret
}

// Present reports whether a call could be made at all. It is what the settings
// endpoint answers with, and is deliberately the only thing about the
// credential that leaves this process.
func (c *Credentials) Present() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()

	return c.secret != ""
}

// Credential turns what is held into something that can authenticate a
// request.
//
// The token case carries no Refresher and no expiry on purpose. Renewal
// belongs to the process that holds the refresh token and can write it back to
// the keychain; this one is handed access tokens and uses them. An empty
// expiry is read by TokenSource as "no stated lifetime", so it never tries to
// renew something it has no means of renewing.
func (c *Credentials) Credential(wire llm.Wire) llm.Credential {
	kind, secret := c.Get()

	if secret == "" {
		return nil
	}
	if kind == KindOAuthToken {
		return llm.BearerToken{Source: llm.NewTokenSource(llm.Token{Access: secret}, nil, nil)}
	}

	return llm.APIKey{Wire: wire, Key: secret}
}
