package ai

import (
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/rinki-s/dao/apps/local-service/internal/ai/llm"
)

// Three rows in the shared key/value settings table. None of them is a secret:
// which protocol, which host, which model. The key that opens that host is
// kept somewhere the database cannot reach.
const (
	wireKey    = "ai_provider_wire"
	baseURLKey = "ai_provider_base_url"
	modelKey   = "ai_provider_model"
)

var ErrInvalidProviderSettings = errors.New("invalid provider settings")

type Repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) get(key string) (string, error) {
	var value string

	err := r.db.QueryRow(`SELECT value FROM app_settings WHERE key = ?`, key).Scan(&value)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", err
	}

	return value, nil
}

// Get reads the stored settings. keyPresent is passed in rather than read:
// only the process holding the key knows whether there is one.
func (r *Repository) Get(keyPresent bool) (ProviderSettings, error) {
	settings := ProviderSettings{KeyPresent: keyPresent}

	for key, field := range map[string]*string{
		wireKey:    &settings.Wire,
		baseURLKey: &settings.BaseURL,
		modelKey:   &settings.Model,
	} {
		value, err := r.get(key)
		if err != nil {
			return ProviderSettings{}, err
		}
		*field = value
	}

	// Configured means a call can actually be made. Three settings and a key,
	// all four or none — anything less is a form half filled in, and the UI
	// should say so rather than let a request fail at the provider.
	settings.Configured = settings.Wire != "" &&
		settings.BaseURL != "" &&
		settings.Model != "" &&
		keyPresent

	return settings, nil
}

func validate(request UpdateProviderSettingsRequest) (UpdateProviderSettingsRequest, error) {
	clean := UpdateProviderSettingsRequest{
		Wire:    strings.TrimSpace(request.Wire),
		BaseURL: strings.TrimSpace(request.BaseURL),
		Model:   strings.TrimSpace(request.Model),
	}

	if clean.Wire != string(llm.WireAnthropic) && clean.Wire != string(llm.WireOpenAI) {
		return clean, fmt.Errorf("%w: unknown format %q", ErrInvalidProviderSettings, clean.Wire)
	}
	if clean.Model == "" {
		return clean, fmt.Errorf("%w: model is required", ErrInvalidProviderSettings)
	}

	// Checked here rather than at call time: a typo in a base URL should be
	// refused by the form that took it, not surface later as a failed run.
	parsed, err := url.Parse(clean.BaseURL)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return clean, fmt.Errorf("%w: base URL must be an http(s) URL", ErrInvalidProviderSettings)
	}

	return clean, nil
}

func (r *Repository) Set(request UpdateProviderSettingsRequest, keyPresent bool) (ProviderSettings, error) {
	clean, err := validate(request)
	if err != nil {
		return ProviderSettings{}, err
	}

	now := time.Now().UTC().Format(time.RFC3339)

	transaction, err := r.db.Begin()
	if err != nil {
		return ProviderSettings{}, err
	}
	defer func() { _ = transaction.Rollback() }()

	for key, value := range map[string]string{
		wireKey:    clean.Wire,
		baseURLKey: clean.BaseURL,
		modelKey:   clean.Model,
	} {
		if _, err := transaction.Exec(`
			INSERT INTO app_settings (key, value, updated_at)
			VALUES (?, ?, ?)
			ON CONFLICT(key) DO UPDATE SET
				value = excluded.value,
				updated_at = excluded.updated_at
		`, key, value, now); err != nil {
			return ProviderSettings{}, err
		}
	}

	if err := transaction.Commit(); err != nil {
		return ProviderSettings{}, err
	}

	return r.Get(keyPresent)
}

// Config assembles what llm.New needs. The credential arrives from the caller,
// so this package never has to know where it was kept or what kind it is.
func (r *Repository) Config(credentials *Credentials) (llm.Config, error) {
	settings, err := r.Get(credentials.Present())
	if err != nil {
		return llm.Config{}, err
	}

	wire := llm.Wire(settings.Wire)

	return llm.Config{
		Wire:    wire,
		BaseURL: settings.BaseURL,
		Model:   settings.Model,
		// Which header this ends up in, and whether it renews, is the
		// credential's business rather than this one's.
		Credential: credentials.Credential(wire),
	}, nil
}
