package search

import (
	"database/sql"
	"strings"
)

type Repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) Search(query string) ([]Result, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return []Result{}, nil
	}

	rows, err := r.db.Query(`
		SELECT
			entity_type,
			entity_id,
			workspace_id,
			project_id,
			title,
			snippet(search_index, 5, '', '', '...', 12)
		FROM search_index
		WHERE search_index MATCH ?
		ORDER BY rank
		LIMIT 50
	`, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	results := []Result{}

	for rows.Next() {
		var result Result

		if err := rows.Scan(
			&result.EntityType,
			&result.EntityID,
			&result.WorkspaceID,
			&result.ProjectID,
			&result.Title,
			&result.Snippet,
		); err != nil {
			return nil, err
		}

		results = append(results, result)
	}

	return results, rows.Err()
}
