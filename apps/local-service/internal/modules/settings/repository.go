package settings

import (
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const workingDirectoryKey = "working_directory"

var ErrWorkingDirectoryNotConfigured = errors.New("working directory is not configured")

type Repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) GetWorkingDirectory() (string, bool, error) {
	var path string

	err := r.db.QueryRow(`
		SELECT value
		FROM app_settings
		WHERE key = ?
	`, workingDirectoryKey).Scan(&path)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", false, nil
		}

		return "", false, err
	}

	return path, path != "", nil
}

func (r *Repository) RequireWorkingDirectory() (string, error) {
	path, configured, err := r.GetWorkingDirectory()
	if err != nil {
		return "", err
	}

	if !configured {
		return "", ErrWorkingDirectoryNotConfigured
	}

	return path, nil
}

func (r *Repository) SetWorkingDirectory(path string) (string, error) {
	trimmedPath := strings.TrimSpace(path)
	if trimmedPath == "" {
		return "", ErrWorkingDirectoryNotConfigured
	}

	absolutePath, err := filepath.Abs(trimmedPath)
	if err != nil {
		return "", err
	}

	if err := os.MkdirAll(absolutePath, 0755); err != nil {
		return "", err
	}

	now := time.Now().UTC().Format(time.RFC3339)

	_, err = r.db.Exec(`
		INSERT INTO app_settings (key, value, updated_at)
		VALUES (?, ?, ?)
		ON CONFLICT(key) DO UPDATE SET
			value = excluded.value,
			updated_at = excluded.updated_at
	`, workingDirectoryKey, absolutePath, now)
	if err != nil {
		return "", err
	}

	return absolutePath, nil
}
