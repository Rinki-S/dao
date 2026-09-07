// Package harness assembles what a model is asked, and checks what it answers.
//
// The layers are the ones docs/ai-harness.md names: context, prompt, output
// schema, trace. What is here is deliberately small — no tool registry, no
// permission levels — because the first feature needs none of them, and an
// abstraction with no caller has nothing shaping it.
package harness

import (
	"database/sql"
	"fmt"
	"os"
	"strings"
	"time"
)

// The context budget. A day's work has no natural size, so something has to
// bound it: an unbounded context is a request that grows until it is refused,
// and at a cost that grows with it.
//
// Notes are taken newest first, because the thing worth summarising is
// usually the thing most recently touched.
const (
	maxNotes      = 12
	maxNoteChars  = 2000
	maxTotalChars = 12000
)

// TouchedNote is a note the day changed.
type TouchedNote struct {
	Title     string
	Content   string
	UpdatedAt string
}

// Day is everything a summary of one day may look at. It matches, item for
// item, the list the settings panel shows before a key is entered: what was
// touched, the text of it, and nothing from another workspace or another day.
type Day struct {
	Date         string
	Notes        []TouchedNote
	Tasks        string
	TasksTouched bool
}

// Included is what actually went, after the budget. A summary drawn from part
// of a day should be able to say so — otherwise the reader takes it for an
// account of the whole day.
type Included struct {
	Notes         int  `json:"notes"`
	NotesDropped  int  `json:"notesDropped"`
	TasksIncluded bool `json:"tasksIncluded"`
	Truncated     bool `json:"truncated"`
}

func (i Included) Empty() bool {
	return i.Notes == 0 && !i.TasksIncluded
}

func clip(text string, limit int) (string, bool) {
	if len(text) <= limit {
		return text, false
	}

	// Cut on a rune boundary, or the tail becomes a replacement character.
	cut := limit
	for cut > 0 && !isRuneStart(text[cut]) {
		cut--
	}

	return text[:cut], true
}

func isRuneStart(b byte) bool {
	return b&0xC0 != 0x80
}

// RenderDay turns a day into the text a model reads, and reports what fitted.
//
// Plain prose with headings rather than JSON: the model is being asked to read
// this, not to parse it, and every token spent on syntax is a token not spent
// on content.
func RenderDay(day Day) (string, Included) {
	var builder strings.Builder
	included := Included{}
	remaining := maxTotalChars

	fmt.Fprintf(&builder, "Date: %s\n", day.Date)

	if day.TasksTouched && strings.TrimSpace(day.Tasks) != "" {
		text, clipped := clip(day.Tasks, min(maxNoteChars, remaining))
		if strings.TrimSpace(text) != "" {
			builder.WriteString("\n## Task list\n\n")
			builder.WriteString(text)
			builder.WriteString("\n")
			remaining -= len(text)
			included.TasksIncluded = true
			included.Truncated = included.Truncated || clipped
		}
	}

	for _, note := range day.Notes {
		if included.Notes >= maxNotes || remaining <= 0 {
			included.NotesDropped++
			included.Truncated = true
			continue
		}

		text, clipped := clip(note.Content, min(maxNoteChars, remaining))
		fmt.Fprintf(&builder, "\n## Note: %s\n\n", note.Title)
		if strings.TrimSpace(text) == "" {
			builder.WriteString("(empty)\n")
		} else {
			builder.WriteString(text)
			builder.WriteString("\n")
		}

		remaining -= len(text)
		included.Notes++
		included.Truncated = included.Truncated || clipped
	}

	return builder.String(), included
}

// TasksReader reads a workspace's task document. It is a function rather than
// the tasks repository so this package does not depend on a module that may
// one day depend on it.
type TasksReader func(workspaceID string) (content string, updatedAt time.Time, err error)

type Gatherer struct {
	db    *sql.DB
	tasks TasksReader
}

func NewGatherer(db *sql.DB, tasks TasksReader) *Gatherer {
	return &Gatherer{db: db, tasks: tasks}
}

// StartOfDay is the moment the given day began where the user is. A due date
// and a day's work are calendar facts, not instants, and a summary asked for
// at 00:30 is about the day the user thinks they are in.
func StartOfDay(now time.Time) time.Time {
	return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
}

// Today collects one workspace's day.
//
// Notes are read from updated_at rather than from the activity log: the log
// records creation only, so a day spent editing would look empty in it.
func (g *Gatherer) Today(workspaceID string, now time.Time) (Day, error) {
	start := StartOfDay(now)
	// Both sides are RFC3339 in UTC, which compares correctly as text.
	since := start.UTC().Format(time.RFC3339)

	day := Day{Date: start.Format("2006-01-02")}

	rows, err := g.db.Query(`
		SELECT title, file_path, updated_at
		FROM notes
		WHERE workspace_id = ?
		  AND deleted_at IS NULL
		  AND updated_at >= ?
		ORDER BY updated_at DESC, id DESC
		LIMIT ?
	`, workspaceID, since, maxNotes)
	if err != nil {
		return Day{}, err
	}
	defer rows.Close()

	type touched struct{ title, path, updatedAt string }
	var found []touched

	for rows.Next() {
		var item touched
		if err := rows.Scan(&item.title, &item.path, &item.updatedAt); err != nil {
			return Day{}, err
		}
		found = append(found, item)
	}
	if err := rows.Err(); err != nil {
		return Day{}, err
	}

	for _, item := range found {
		content, err := readFile(item.path)
		if err != nil {
			// A note whose file has gone is not a reason to fail the summary;
			// it is one fewer thing to summarise.
			continue
		}
		day.Notes = append(day.Notes, TouchedNote{
			Title:     item.title,
			Content:   content,
			UpdatedAt: item.updatedAt,
		})
	}

	if g.tasks != nil {
		content, updatedAt, err := g.tasks(workspaceID)
		if err == nil && !updatedAt.Before(start) {
			day.Tasks = content
			day.TasksTouched = true
		}
	}

	return day, nil
}

func readFile(path string) (string, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return string(content), nil
}
