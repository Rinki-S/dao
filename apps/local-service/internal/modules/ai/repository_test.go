package ai

import (
	"database/sql"
	"errors"
	"path/filepath"
	"testing"

	_ "modernc.org/sqlite"
)

func openTestDB(t *testing.T) *sql.DB {
	t.Helper()

	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "ai-test.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { db.Close() })

	if _, err := db.Exec(`
		CREATE TABLE app_settings (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);
	`); err != nil {
		t.Fatalf("create schema: %v", err)
	}

	return db
}

func validRequest() UpdateProviderSettingsRequest {
	return UpdateProviderSettingsRequest{
		Wire:    "openai",
		BaseURL: "https://api.example.com",
		Model:   "some-model",
	}
}

func TestNothingStoredReadsBackEmpty(t *testing.T) {
	settings, err := NewRepository(openTestDB(t)).Get(false)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}

	if settings.Configured {
		t.Error("Configured on a fresh install")
	}
	if settings.Wire != "" || settings.BaseURL != "" || settings.Model != "" {
		t.Errorf("settings = %+v, want empty", settings)
	}
}

func TestSettingsRoundTrip(t *testing.T) {
	repo := NewRepository(openTestDB(t))

	saved, err := repo.Set(validRequest(), true)
	if err != nil {
		t.Fatalf("Set: %v", err)
	}
	if !saved.Configured {
		t.Error("Configured = false with all three settings and a key")
	}

	read, err := repo.Get(true)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if read != saved {
		t.Errorf("Get = %+v, want %+v", read, saved)
	}
}

func TestConfiguredNeedsTheKeyToo(t *testing.T) {
	// Settings without a key is a form half filled in. Reporting it as
	// configured would let the UI offer a button that can only fail.
	repo := NewRepository(openTestDB(t))

	settings, err := repo.Set(validRequest(), false)
	if err != nil {
		t.Fatalf("Set: %v", err)
	}

	if settings.Configured {
		t.Error("Configured = true with no key")
	}
	if settings.KeyPresent {
		t.Error("KeyPresent = true with no key")
	}
}

func TestSettingsAreTrimmed(t *testing.T) {
	// Pasted keys and URLs arrive with whitespace more often than not.
	repo := NewRepository(openTestDB(t))

	settings, err := repo.Set(UpdateProviderSettingsRequest{
		Wire:    " openai ",
		BaseURL: "  https://api.example.com  ",
		Model:   " some-model\n",
	}, true)
	if err != nil {
		t.Fatalf("Set: %v", err)
	}

	if settings.BaseURL != "https://api.example.com" || settings.Model != "some-model" {
		t.Errorf("settings = %+v, want trimmed values", settings)
	}
}

func TestInvalidSettingsAreRefused(t *testing.T) {
	cases := []struct {
		name    string
		request UpdateProviderSettingsRequest
	}{
		{"unknown wire", UpdateProviderSettingsRequest{Wire: "gemini", BaseURL: "https://x.test", Model: "m"}},
		{"no wire", UpdateProviderSettingsRequest{BaseURL: "https://x.test", Model: "m"}},
		{"no model", UpdateProviderSettingsRequest{Wire: "openai", BaseURL: "https://x.test"}},
		{"base url without scheme", UpdateProviderSettingsRequest{Wire: "openai", BaseURL: "api.example.com", Model: "m"}},
		{"base url with the wrong scheme", UpdateProviderSettingsRequest{Wire: "openai", BaseURL: "ftp://x.test", Model: "m"}},
		{"no base url", UpdateProviderSettingsRequest{Wire: "openai", Model: "m"}},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			repo := NewRepository(openTestDB(t))

			if _, err := repo.Set(testCase.request, true); !errors.Is(err, ErrInvalidProviderSettings) {
				t.Errorf("Set error = %v, want ErrInvalidProviderSettings", err)
			}

			// A refused write must leave nothing behind.
			settings, err := repo.Get(true)
			if err != nil {
				t.Fatalf("Get: %v", err)
			}
			if settings.Wire != "" || settings.BaseURL != "" || settings.Model != "" {
				t.Errorf("settings = %+v, want nothing written", settings)
			}
		})
	}
}

func TestConfigCarriesTheKeyWithoutStoringIt(t *testing.T) {
	repo := NewRepository(openTestDB(t))
	if _, err := repo.Set(validRequest(), true); err != nil {
		t.Fatalf("Set: %v", err)
	}

	config, err := repo.Config("secret-key")
	if err != nil {
		t.Fatalf("Config: %v", err)
	}
	if config.APIKey != "secret-key" {
		t.Errorf("APIKey = %q", config.APIKey)
	}
	if err := config.Validate(); err != nil {
		t.Errorf("the assembled config is not usable: %v", err)
	}

	// The key came from the caller, so nothing about it can have reached the
	// database — the only place these settings persist.
	var count int
	if err := repo.db.QueryRow(
		`SELECT count(*) FROM app_settings WHERE value LIKE '%secret-key%'`,
	).Scan(&count); err != nil {
		t.Fatalf("query: %v", err)
	}
	if count != 0 {
		t.Error("the API key reached the database")
	}
}
