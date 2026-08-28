package chats

import (
	"database/sql"
	"errors"
	"fmt"
	"path/filepath"
	"testing"
	"time"

	_ "modernc.org/sqlite"
)

func openTestDB(t *testing.T) *sql.DB {
	t.Helper()

	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "chats-test.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { db.Close() })

	if _, err := db.Exec(`
		CREATE TABLE chat_conversations (
			id TEXT PRIMARY KEY,
			workspace_id TEXT NOT NULL,
			title TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);

		CREATE TABLE chat_messages (
			id TEXT PRIMARY KEY,
			conversation_id TEXT NOT NULL,
			role TEXT NOT NULL,
			content TEXT NOT NULL DEFAULT '',
			position INTEGER NOT NULL,
			model TEXT NOT NULL DEFAULT '',
			wire TEXT NOT NULL DEFAULT '',
			input_tokens INTEGER NOT NULL DEFAULT 0,
			output_tokens INTEGER NOT NULL DEFAULT 0,
			status TEXT NOT NULL DEFAULT 'ok',
			error_message TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL,
			UNIQUE (conversation_id, position)
		);
	`); err != nil {
		t.Fatalf("create schema: %v", err)
	}

	return db
}

// newRepo gives every repository a counting id generator and a clock that does
// not move. A frozen clock is the point of the ordering tests below: it is
// exactly the case where two turns share a timestamp.
func newRepo(t *testing.T) *Repository {
	t.Helper()

	next := 0
	repo := NewRepository(openTestDB(t), func() string {
		next++
		return fmt.Sprintf("id-%02d", next)
	})

	frozen := time.Date(2026, 8, 27, 10, 0, 0, 0, time.UTC)
	repo.now = func() time.Time { return frozen }

	return repo
}

func newConversation(t *testing.T, repo *Repository) Conversation {
	t.Helper()

	conversation, err := repo.CreateConversation(CreateConversationRequest{WorkspaceID: "ws-1"})
	if err != nil {
		t.Fatalf("CreateConversation: %v", err)
	}

	return conversation
}

func appendTurn(t *testing.T, repo *Repository, id, role, content string) Message {
	t.Helper()

	message, err := repo.Append(id, Message{Role: role, Content: content})
	if err != nil {
		t.Fatalf("Append(%s): %v", role, err)
	}

	return message
}

// The reason position is a column. Every turn here shares a timestamp, which
// is what a reply from a local model actually looks like at second precision —
// so a transcript ordered by created_at could come back in any order, and one
// wrong order makes the model appear to answer a question it was not asked.
func TestTurnOrderSurvivesIdenticalTimestamps(t *testing.T) {
	repo := newRepo(t)
	conversation := newConversation(t, repo)

	want := []string{"first", "second", "third", "fourth"}
	for i, content := range want {
		role := RoleUser
		if i%2 == 1 {
			role = RoleAssistant
		}
		appendTurn(t, repo, conversation.ID, role, content)
	}

	messages, err := repo.Messages(conversation.ID)
	if err != nil {
		t.Fatalf("Messages: %v", err)
	}

	if len(messages) != len(want) {
		t.Fatalf("got %d messages, want %d", len(messages), len(want))
	}
	for i, message := range messages {
		if message.Content != want[i] {
			t.Errorf("message %d = %q, want %q", i, message.Content, want[i])
		}
		if message.Position != i {
			t.Errorf("message %d has position %d", i, message.Position)
		}
	}
}

func TestTheFirstUserTurnNamesTheConversation(t *testing.T) {
	repo := newRepo(t)
	conversation := newConversation(t, repo)

	appendTurn(t, repo, conversation.ID, RoleUser, "How does the streaming wire work?\nSecond line ignored.")
	appendTurn(t, repo, conversation.ID, RoleAssistant, "It reads server-sent events.")

	named, err := repo.GetConversation(conversation.ID)
	if err != nil {
		t.Fatalf("GetConversation: %v", err)
	}

	if named.Title != "How does the streaming wire work?" {
		t.Errorf("Title = %q, want it taken from the first line of the first turn", named.Title)
	}
}

// A title the user chose must survive the first message, or renaming a
// conversation before sending would be silently undone.
func TestAGivenTitleIsNotOverwritten(t *testing.T) {
	repo := newRepo(t)

	conversation, err := repo.CreateConversation(CreateConversationRequest{
		WorkspaceID: "ws-1", Title: "Wire notes",
	})
	if err != nil {
		t.Fatalf("CreateConversation: %v", err)
	}

	appendTurn(t, repo, conversation.ID, RoleUser, "something else entirely")

	named, _ := repo.GetConversation(conversation.ID)
	if named.Title != "Wire notes" {
		t.Errorf("Title = %q, want the one that was given", named.Title)
	}
}

func TestDeriveTitle(t *testing.T) {
	for _, testCase := range []struct{ name, in, want string }{
		{"plain", "What is SSE?", "What is SSE?"},
		{"first line only", "Line one\nLine two", "Line one"},
		{"strips markdown", "## A heading", "A heading"},
		{"strips a bullet", "- a list item", "a list item"},
		{"trims", "   spaced   ", "spaced"},
		{"empty", "", ""},
		{
			"cuts long english at a word boundary",
			"aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii jjjj kkkk llll mmmm nnnn",
			"aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii jjjj kkkk llll…",
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			if got := DeriveTitle(testCase.in); got != testCase.want {
				t.Errorf("DeriveTitle(%q) = %q, want %q", testCase.in, got, testCase.want)
			}
		})
	}
}

// Counted in runes, not bytes. Cutting Chinese at 60 bytes gives 20
// characters, and cutting mid-rune gives a replacement character.
func TestALongChineseTitleIsCutByCharacter(t *testing.T) {
	title := DeriveTitle(repeatRune('式', 80))

	runes := []rune(title)
	if len(runes) != maxTitleRunes+1 { // the ellipsis
		t.Errorf("title is %d runes, want %d plus an ellipsis", len(runes), maxTitleRunes)
	}
	for _, r := range runes[:len(runes)-1] {
		if r == '�' {
			t.Fatal("cut in the middle of a rune")
		}
	}
}

func repeatRune(r rune, count int) string {
	runes := make([]rune, count)
	for i := range runes {
		runes[i] = r
	}
	return string(runes)
}

// The ordering the conversation list depends on: activity, not creation. A
// thread replied to this morning matters more than one opened last week.
func TestConversationsAreListedByLastActivity(t *testing.T) {
	repo := newRepo(t)

	moment := time.Date(2026, 8, 27, 10, 0, 0, 0, time.UTC)
	repo.now = func() time.Time { return moment }

	first := newConversation(t, repo)
	moment = moment.Add(time.Minute)
	second := newConversation(t, repo)

	// The older conversation gets the newer message.
	moment = moment.Add(time.Minute)
	appendTurn(t, repo, first.ID, RoleUser, "still going")

	conversations, err := repo.ListConversations("ws-1")
	if err != nil {
		t.Fatalf("ListConversations: %v", err)
	}

	if len(conversations) != 2 {
		t.Fatalf("got %d conversations", len(conversations))
	}
	if conversations[0].ID != first.ID {
		t.Errorf("first listed = %q, want the recently active one (%q)", conversations[0].ID, first.ID)
	}
	if conversations[1].ID != second.ID {
		t.Errorf("second listed = %q", conversations[1].ID)
	}
}

func TestListingIsScopedToOneWorkspace(t *testing.T) {
	repo := newRepo(t)

	newConversation(t, repo)
	if _, err := repo.CreateConversation(CreateConversationRequest{WorkspaceID: "ws-2"}); err != nil {
		t.Fatalf("CreateConversation: %v", err)
	}

	conversations, err := repo.ListConversations("ws-1")
	if err != nil {
		t.Fatalf("ListConversations: %v", err)
	}
	if len(conversations) != 1 {
		t.Errorf("got %d conversations, want only this workspace's", len(conversations))
	}
}

// The whole reason the assistant row is written before the stream runs: a
// failure has somewhere to put the text that did arrive.
func TestAFailedStreamKeepsWhatItManagedToWrite(t *testing.T) {
	repo := newRepo(t)
	conversation := newConversation(t, repo)

	appendTurn(t, repo, conversation.ID, RoleUser, "explain SSE")
	placeholder := appendTurn(t, repo, conversation.ID, RoleAssistant, "")

	finished, err := repo.Finish(placeholder.ID, Message{
		Content:      "Server-sent events are",
		Model:        "gemma3:12b",
		Wire:         "openai",
		Status:       StatusFailed,
		ErrorMessage: "connection reset",
	})
	if err != nil {
		t.Fatalf("Finish: %v", err)
	}

	if finished.Content != "Server-sent events are" {
		t.Errorf("Content = %q, want the partial answer kept", finished.Content)
	}
	if finished.Status != StatusFailed {
		t.Errorf("Status = %q, want it marked as failed rather than passed off as complete", finished.Status)
	}
	if finished.ErrorMessage != "connection reset" {
		t.Errorf("ErrorMessage = %q", finished.ErrorMessage)
	}
	// Position must not move: the turn kept its place in the transcript.
	if finished.Position != placeholder.Position {
		t.Errorf("Position moved from %d to %d", placeholder.Position, finished.Position)
	}
}

func TestFinishRecordsWhichModelAnswered(t *testing.T) {
	repo := newRepo(t)
	conversation := newConversation(t, repo)

	appendTurn(t, repo, conversation.ID, RoleUser, "hi")
	placeholder := appendTurn(t, repo, conversation.ID, RoleAssistant, "")

	finished, err := repo.Finish(placeholder.ID, Message{
		Content: "hello", Model: "gemma3:12b", Wire: "openai",
		InputTokens: 7, OutputTokens: 2,
	})
	if err != nil {
		t.Fatalf("Finish: %v", err)
	}

	if finished.Model != "gemma3:12b" || finished.Wire != "openai" {
		t.Errorf("model/wire = %q/%q", finished.Model, finished.Wire)
	}
	if finished.InputTokens != 7 || finished.OutputTokens != 2 {
		t.Errorf("tokens = %d/%d", finished.InputTokens, finished.OutputTokens)
	}
	if finished.Status != StatusOK {
		t.Errorf("Status = %q, want ok by default", finished.Status)
	}
}

// The schema declares ON DELETE CASCADE, and the service opens its database
// with foreign keys enforced — but the database this test builds does not, on
// purpose. It is the case where the cascade does nothing, which is what makes
// this the test of the repository's own delete rather than of SQLite's.
func TestDeletingAConversationRemovesItsMessages(t *testing.T) {
	repo := newRepo(t)
	conversation := newConversation(t, repo)

	appendTurn(t, repo, conversation.ID, RoleUser, "one")
	appendTurn(t, repo, conversation.ID, RoleAssistant, "two")

	if err := repo.Delete(conversation.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	var remaining int
	if err := repo.db.QueryRow(
		`SELECT COUNT(*) FROM chat_messages WHERE conversation_id = ?`, conversation.ID,
	).Scan(&remaining); err != nil {
		t.Fatalf("count: %v", err)
	}
	if remaining != 0 {
		t.Errorf("%d messages left behind", remaining)
	}

	if _, err := repo.GetConversation(conversation.ID); !errors.Is(err, ErrConversationNotFound) {
		t.Errorf("GetConversation err = %v, want ErrConversationNotFound", err)
	}
}

func TestAppendingToAMissingConversationIsRefused(t *testing.T) {
	repo := newRepo(t)

	_, err := repo.Append("nope", Message{Role: RoleUser, Content: "hi"})
	if !errors.Is(err, ErrConversationNotFound) {
		t.Errorf("err = %v, want ErrConversationNotFound", err)
	}
}

func TestAnUnknownRoleIsRefused(t *testing.T) {
	repo := newRepo(t)
	conversation := newConversation(t, repo)

	_, err := repo.Append(conversation.ID, Message{Role: "system", Content: "you are..."})
	if !errors.Is(err, ErrInvalidRequest) {
		t.Errorf("err = %v, want ErrInvalidRequest", err)
	}
}

func TestRename(t *testing.T) {
	repo := newRepo(t)
	conversation := newConversation(t, repo)

	renamed, err := repo.Rename(conversation.ID, "  Streaming notes  ")
	if err != nil {
		t.Fatalf("Rename: %v", err)
	}
	if renamed.Title != "Streaming notes" {
		t.Errorf("Title = %q, want it trimmed", renamed.Title)
	}

	if _, err := repo.Rename(conversation.ID, "   "); !errors.Is(err, ErrInvalidRequest) {
		t.Errorf("blank rename err = %v, want ErrInvalidRequest", err)
	}
	if _, err := repo.Rename("nope", "x"); !errors.Is(err, ErrConversationNotFound) {
		t.Errorf("missing rename err = %v, want ErrConversationNotFound", err)
	}
}

// Encoded straight to JSON, where a nil slice becomes null and an empty one
// becomes []. The renderer should not have to tell those apart.
func TestEmptyResultsAreListsRatherThanNull(t *testing.T) {
	repo := newRepo(t)
	conversation := newConversation(t, repo)

	conversations, err := repo.ListConversations("ws-empty")
	if err != nil {
		t.Fatalf("ListConversations: %v", err)
	}
	if conversations == nil {
		t.Error("ListConversations returned nil, which encodes as null")
	}

	messages, err := repo.Messages(conversation.ID)
	if err != nil {
		t.Fatalf("Messages: %v", err)
	}
	if messages == nil {
		t.Error("Messages returned nil, which encodes as null")
	}
}
