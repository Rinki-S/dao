package llm

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// Wire is the protocol an endpoint speaks. It is deliberately not a vendor
// name: most vendors speak WireOpenAI, and choosing by protocol is what lets
// one implementation serve all of them.
type Wire string

const (
	WireAnthropic Wire = "anthropic"
	WireOpenAI    Wire = "openai"
)

const defaultTimeout = 90 * time.Second

var (
	ErrNotConfigured = errors.New("no model provider is configured")
	ErrUnknownWire   = errors.New("unknown provider format")
)

// Config is everything needed to reach a model. The credential is passed in
// rather than read from anywhere: it lives in the OS keychain and arrives
// through the process boundary, and this package should not know where it
// came from.
type Config struct {
	Wire    Wire
	BaseURL string
	Model   string

	// APIKey is the common case, spelled as a plain field so a caller that
	// only has a key does not have to construct anything.
	APIKey string
	// Credential is the general case. When set it wins over APIKey: an OAuth
	// token renews itself, which a key cannot do.
	Credential Credential
}

// credential is the one the request should actually use. Keeping this behind
// a method is what lets APIKey stay a plain string for the callers that only
// ever have one.
func (c Config) credential() Credential {
	if c.Credential != nil {
		return c.Credential
	}
	return APIKey{Wire: c.Wire, Key: c.APIKey}
}

func (c Config) Validate() error {
	switch {
	case c.BaseURL == "" || c.Model == "":
		return ErrNotConfigured
	// Either shape of credential will do, but one of them must be there.
	case c.APIKey == "" && c.Credential == nil:
		return ErrNotConfigured
	case c.Wire != WireAnthropic && c.Wire != WireOpenAI:
		return fmt.Errorf("%w: %q", ErrUnknownWire, c.Wire)
	}
	return nil
}

type Options struct {
	// MaxTokens caps the answer. Every wire requires or accepts one, and a
	// caller parsing structured output needs the ceiling high enough that a
	// complete object fits.
	MaxTokens int

	// Tools the model may ask to have run.
	//
	// Per call rather than per client, because which tools exist is a property
	// of what is being asked, not of which provider is configured: a summary
	// run offers none, and a chat offers the ones its workspace can answer.
	Tools []ToolDefinition
}

// Client is the whole surface the rest of Dao sees. One method: no streaming,
// because a response that is validated against a schema cannot be acted on
// until it is complete. Streaming can be added beside it later without the
// types above changing.
type Client interface {
	Complete(ctx context.Context, request Context, opts Options) (Response, error)
}

// New picks the implementation for the configured wire.
func New(cfg Config, httpClient *http.Client) (Client, error) {
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	if httpClient == nil {
		httpClient = &http.Client{Timeout: defaultTimeout}
	}

	base := strings.TrimSuffix(cfg.BaseURL, "/")

	switch cfg.Wire {
	case WireAnthropic:
		return &anthropicClient{config: cfg, baseURL: base, http: httpClient}, nil
	case WireOpenAI:
		return &openAIClient{config: cfg, baseURL: base, http: httpClient}, nil
	default:
		return nil, fmt.Errorf("%w: %q", ErrUnknownWire, cfg.Wire)
	}
}

// APIError is a refusal from the provider rather than a failure to reach it.
// The status is kept so callers can tell an unusable key from a rate limit
// from a request the endpoint did not understand, and report accordingly.
type APIError struct {
	StatusCode int
	Body       string
}

func (e *APIError) Error() string {
	return fmt.Sprintf("provider returned %d: %s", e.StatusCode, truncate(e.Body, 500))
}

func truncate(text string, limit int) string {
	if len(text) <= limit {
		return text
	}
	return text[:limit] + "…"
}
