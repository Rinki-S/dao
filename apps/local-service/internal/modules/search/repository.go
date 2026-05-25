package search

import (
	"database/sql"
	"strings"
	"unicode"
)

type Repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) IndexTx(tx *sql.Tx, entry IndexEntry) error {
	_, err := tx.Exec(`
		INSERT INTO search_index (
			entity_type,
			entity_id,
			workspace_id,
			project_id,
			title,
			body,
			created_at,
			updated_at
		)
		VALUES (
			?, ?, ?, ?, ?, ?, ?, ?
		)
	`,
		entry.EntityType,
		entry.EntityID,
		entry.WorkspaceID,
		entry.ProjectID,
		entry.Title,
		entry.Body,
		entry.CreatedAt,
		entry.UpdatedAt,
	)

	return err
}

func (r *Repository) Search(query string) ([]Result, error) {
	matchQuery := buildMatchQuery(query)
	if matchQuery == "" {
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
	`, matchQuery)
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

func buildMatchQuery(query string) string {
	tokens := strings.FieldsFunc(strings.TrimSpace(query), func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsNumber(r)
	})

	quotedTokens := make([]string, 0, len(tokens))
	for _, token := range tokens {
		token = strings.TrimSpace(token)
		if token == "" {
			continue
		}

		quotedTokens = append(quotedTokens, `"`+strings.ReplaceAll(token, `"`, `""`)+`"*`)
	}

	return strings.Join(quotedTokens, " ")
}
