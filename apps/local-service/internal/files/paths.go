package files

import (
	"os"
	"path/filepath"
	"strings"
	"unicode"
)

func WorkspaceFolderPath(workingDirectory string, name string, id string) string {
	return filepath.Join(workingDirectory, EntityFolderName(name, id))
}

func ProjectFolderPath(workspaceRoot string, name string, id string) string {
	return filepath.Join(workspaceRoot, EntityFolderName(name, id))
}

func MarkdownNoteFilePath(parentDir string, title string, id string) string {
	return filepath.Join(parentDir, EntityFolderName(title, id)+".md")
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
