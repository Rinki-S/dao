package tasks

import (
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"strings"
)

// MigrateRowsToDocuments moves tasks that were stored as table rows into each
// workspace's Markdown file, once, and then clears the rows it moved.
//
// It runs at startup rather than as a goose migration because the destination
// is a file, which SQL cannot write. It is safe to call on every start: a
// workspace whose rows are already gone has nothing to move, and a workspace
// whose file already has content is left alone rather than appended to.
func MigrateRowsToDocuments(db *sql.DB, repo *Repository) error {
	if !tasksTableExists(db) {
		return nil
	}

	workspaceIDs, err := workspacesWithRows(db)
	if err != nil {
		return err
	}

	for _, workspaceID := range workspaceIDs {
		if err := migrateWorkspace(db, repo, workspaceID); err != nil {
			return fmt.Errorf("migrate tasks for workspace %s: %w", workspaceID, err)
		}
	}

	return nil
}

func migrateWorkspace(db *sql.DB, repo *Repository, workspaceID string) error {
	document, err := repo.Get(workspaceID)
	if err != nil {
		// A workspace that no longer exists cannot receive its rows; leaving
		// them in place is better than failing every start from here on.
		if errors.Is(err, ErrWorkspaceNotFound) {
			return nil
		}

		return err
	}

	// Anything beyond the heading means this file is already someone's task
	// list. Appending migrated rows to it would duplicate work already moved.
	if strings.TrimSpace(strings.TrimPrefix(document.Content, emptyDocument)) != "" {
		return nil
	}

	rows, err := loadRows(db, workspaceID)
	if err != nil {
		return err
	}
	if len(rows) == 0 {
		return nil
	}

	if _, err := repo.Update(workspaceID, renderRows(rows)); err != nil {
		return err
	}

	// Only now, with the file written: the rows are the sole copy until then.
	if _, err := db.Exec(`DELETE FROM tasks WHERE workspace_id = ?`, workspaceID); err != nil {
		return err
	}

	_, err = db.Exec(`DELETE FROM search_index WHERE entity_type = 'task' AND workspace_id = ? AND entity_id <> ?`, workspaceID, workspaceID)

	return err
}

type row struct {
	id       string
	parentID *string
	title    string
	body     string
	status   string
	priority string
	dueDate  *string
}

func loadRows(db *sql.DB, workspaceID string) ([]row, error) {
	result, err := db.Query(`
		SELECT id, parent_id, title, description, status, priority, due_date
		FROM tasks
		WHERE workspace_id = ? AND deleted_at IS NULL
		ORDER BY created_at
	`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer result.Close()

	rows := []row{}

	for result.Next() {
		var item row
		if err := result.Scan(
			&item.id,
			&item.parentID,
			&item.title,
			&item.body,
			&item.status,
			&item.priority,
			&item.dueDate,
		); err != nil {
			return nil, err
		}

		rows = append(rows, item)
	}

	return rows, result.Err()
}

// renderRows writes the rows as a nested checkbox list. Nesting came from
// parent_id; from here on it is indentation, which is the only thing the file
// can express.
func renderRows(rows []row) string {
	children := map[string][]row{}
	roots := []row{}

	byID := map[string]bool{}
	for _, item := range rows {
		byID[item.id] = true
	}

	for _, item := range rows {
		// A row whose parent is gone becomes a root rather than disappearing.
		if item.parentID != nil && byID[*item.parentID] {
			children[*item.parentID] = append(children[*item.parentID], item)
			continue
		}

		roots = append(roots, item)
	}

	var builder strings.Builder
	builder.WriteString(emptyDocument)

	var write func(item row, depth int)
	write = func(item row, depth int) {
		indent := strings.Repeat("  ", depth)

		box := "[ ]"
		if item.status == "done" {
			box = "[x]"
		}

		builder.WriteString(indent + "- " + box + " " + strings.TrimSpace(item.title))

		if item.dueDate != nil && strings.TrimSpace(*item.dueDate) != "" {
			builder.WriteString(" @due(" + strings.TrimSpace(*item.dueDate) + ")")
		}

		// medium is the default and says nothing, so it is left off.
		if item.priority == "high" || item.priority == "low" {
			builder.WriteString(" !" + item.priority)
		}

		builder.WriteString("\n")

		if body := strings.TrimSpace(item.body); body != "" {
			for _, line := range strings.Split(body, "\n") {
				builder.WriteString(indent + "  " + strings.TrimSpace(line) + "\n")
			}
		}

		nested := children[item.id]
		sort.SliceStable(nested, func(a, b int) bool { return nested[a].id < nested[b].id })

		for _, child := range nested {
			write(child, depth+1)
		}
	}

	for _, item := range roots {
		write(item, 0)
	}

	return builder.String()
}

func workspacesWithRows(db *sql.DB) ([]string, error) {
	rows, err := db.Query(`
		SELECT DISTINCT workspace_id
		FROM tasks
		WHERE deleted_at IS NULL
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	ids := []string{}

	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}

		ids = append(ids, id)
	}

	return ids, rows.Err()
}

func tasksTableExists(db *sql.DB) bool {
	var name string
	err := db.QueryRow(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tasks'`).Scan(&name)

	return err == nil
}
