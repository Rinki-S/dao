package files

import (
	"os"
	"path/filepath"
	"strings"
	"unicode"
)

const daoDocumentsDirName = "Dao"

func DaoDocumentsRoot() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}

	return filepath.Join(homeDir, "Documents", daoDocumentsDirName), nil
}

func WorkspaceFolderPath(name string, id string) (string, error) {
	root, err := DaoDocumentsRoot()
	if err != nil {
		return "", err
	}

	return filepath.Join(root, EntityFolderName(name, id)), nil
}

func ProjectFolderPath(workspaceRoot string, name string, id string) string {
	return filepath.Join(workspaceRoot, EntityFolderName(name, id))
}

func EntityFolderName(name string, id string) string {
	return SlugifyName(name) + "-" + id
}

func SlugifyName(name string) string {
	normalized := strings.ToLower(strings.TrimSpace(name))
	var builder strings.Builder
	previousDash := false

	for _, value := range normalized {
		if unicode.IsLetter(value) || unicode.IsDigit(value) {
			builder.WriteRune(value)
			previousDash = false
			continue
		}

		if !previousDash {
			builder.WriteRune('-')
			previousDash = true
		}
	}

	slug := strings.Trim(builder.String(), "-")
	if slug == "" {
		return "untitled"
	}

	return slug
}

func EnsureDir(path string) error {
	return os.MkdirAll(path, 0755)
}
