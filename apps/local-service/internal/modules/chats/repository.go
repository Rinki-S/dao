package chats

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode"

	"github.com/rinki-s/dao/apps/local-service/internal/modules/search"
)

var (
	ErrConversationNotFound = errors.New("conversation not found")
	ErrMessageNotFound      = errors.New("message not found")
	ErrInvalidRequest       = errors.New("invalid request")
)

// maxTitleRunes bounds a derived title. Counted in runes rather than bytes so
// a Chinese title is cut at 60 characters rather than at 20.
const maxTitleRunes = 60

type Repository struct {
	db     *sql.DB
	nextID func() string
	now    func() time.Time
	// indexer puts a conversation in the search index. Optional: the tests
	// below build a repository without one, because what they check is what the
	// tables hold, and a nil indexer is also the honest answer for a build that
	// has no search.
	indexer search.Indexer
}

func NewRepository(db *sql.DB, nextID func() string, indexer search.Indexer) *Repository {
	return &Repository{db: db, nextID: nextID, now: time.Now, indexer: indexer}
}

func (r *Repository) timestamp() string {
	return r.now().UTC().Format(time.RFC3339)
}

// DeriveTitle names a conversation after the message that started it.
//
// Asking the user to name a thread before they have said anything is a form to
// fill in before the useful part; naming it afterwards from what they actually
// wrote costs them nothing and is usually right. They can rename it.
func DeriveTitle(content string) string {
	// The first line only. A pasted stack trace or a multi-paragraph question
	// has a first line that reads as a subject, and the rest that does not.
	line := content
	if index := strings.IndexAny(line, "\r\n"); index != -1 {
		line = line[:index]
	}

	// Markdown heading markers and list bullets are punctuation the user typed
	// for the renderer, not part of what they meant to say.
	line = strings.TrimLeft(strings.TrimSpace(line), "#>-*+ \t")
	line = strings.TrimSpace(line)

	runes := []rune(line)
	if len(runes) <= maxTitleRunes {
		return line
	}

	// Cut at a word boundary when there is one close to the limit, so an
	// English title does not end mid-word. CJK has no spaces, in which case
	// the hard cut is correct.
	cut := maxTitleRunes
	for i := maxTitleRunes; i > maxTitleRunes-16 && i > 0; i-- {
		if unicode.IsSpace(runes[i]) {
			cut = i
			break
		}
	}

	return strings.TrimSpace(string(runes[:cut])) + "…"
}

func (r *Repository) CreateConversation(request CreateConversationRequest) (Conversation, error) {
	workspaceID := strings.TrimSpace(request.WorkspaceID)
	if workspaceID == "" {
		return Conversation{}, fmt.Errorf("%w: workspaceId is required", ErrInvalidRequest)
	}

	// The workspace has to exist, and this is where that is checked.
	//
	// Every other table declares the constraint in its schema; chat_conversations
	// does not, and adding it now would mean rebuilding the table. Under the
	// foreign keys this database finally enforces, dropping chat_conversations
	// runs an implicit DELETE FROM, which the ON DELETE CASCADE on chat_messages
	// would answer by removing every message in the database. That is a lot of
	// risk to carry for a constraint on a column nothing ever hard-deletes.
	//
	// This is also the stronger check. A foreign key only asks whether the row
	// is there; workspaces are deleted by setting deleted_at, so a key would
	// happily accept a conversation started in a workspace the user threw away.
	var exists string
	err := r.db.QueryRow(
		`SELECT id FROM workspaces WHERE id = ? AND deleted_at IS NULL`, workspaceID,
	).Scan(&exists)
	if errors.Is(err, sql.ErrNoRows) {
		return Conversation{}, fmt.Errorf("%w: no such workspace", ErrInvalidRequest)
	}
	if err != nil {
		return Conversation{}, err
	}

	now := r.timestamp()
	conversation := Conversation{
		ID:          r.nextID(),
		WorkspaceID: workspaceID,
		Title:       strings.TrimSpace(request.Title),
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	if _, err := r.db.Exec(`
		INSERT INTO chat_conversations (id, workspace_id, title, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?)
	`, conversation.ID, conversation.WorkspaceID, conversation.Title,
		conversation.CreatedAt, conversation.UpdatedAt); err != nil {
		return Conversation{}, err
	}

	return conversation, nil
}

func (r *Repository) GetConversation(id string) (Conversation, error) {
	var conversation Conversation

	err := r.db.QueryRow(`
		SELECT id, workspace_id, title, created_at, updated_at
		FROM chat_conversations WHERE id = ?
	`, id).Scan(
		&conversation.ID, &conversation.WorkspaceID, &conversation.Title,
		&conversation.CreatedAt, &conversation.UpdatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return Conversation{}, ErrConversationNotFound
	}
	if err != nil {
		return Conversation{}, err
	}

	return conversation, nil
}

// ListConversations returns a workspace's threads, most recently active first.
// Ordered by updated_at rather than created_at: a thread you replied to this
// morning is more relevant than one you opened last week and abandoned.
func (r *Repository) ListConversations(workspaceID string) ([]Conversation, error) {
	rows, err := r.db.Query(`
		SELECT id, workspace_id, title, created_at, updated_at
		FROM chat_conversations
		WHERE workspace_id = ?
		ORDER BY updated_at DESC, id DESC
	`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	// Never nil: this is encoded straight to JSON, and a nil slice becomes
	// null, which the renderer would have to guard against separately from an
	// empty list that means the same thing.
	conversations := []Conversation{}

	for rows.Next() {
		var conversation Conversation
		if err := rows.Scan(
			&conversation.ID, &conversation.WorkspaceID, &conversation.Title,
			&conversation.CreatedAt, &conversation.UpdatedAt,
		); err != nil {
			return nil, err
		}
		conversations = append(conversations, conversation)
	}

	return conversations, rows.Err()
}

func (r *Repository) Messages(conversationID string) ([]Message, error) {
	rows, err := r.db.Query(`
		SELECT `+messageColumns+`
		FROM chat_messages
		WHERE conversation_id = ?
		ORDER BY position
	`, conversationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	messages := []Message{}

	for rows.Next() {
		message, err := scanMessage(rows)
		if err != nil {
			return nil, err
		}
		messages = append(messages, message)
	}

	return messages, rows.Err()
}

// The columns of a message, in the order scanMessage reads them. Written once
// because the two places that select a message have to agree, and the way they
// stop agreeing is that someone adds a column to one of them.
const messageColumns = `id, conversation_id, role, content, position,
	       model, wire, input_tokens, output_tokens,
	       status, error_message, created_at, tool_calls`

// reindexTx rewrites a conversation's search entry from what the tables now
// hold.
//
// The whole conversation is one entry rather than one per message. What
// somebody searches for is the conversation where they worked something out,
// and a hit per turn would bury that under its own fragments — the thing they
// want to open is the thread.
//
// Called from inside the transaction that changed it, so the index cannot end
// up describing a conversation that was never committed.
func (r *Repository) reindexTx(tx *sql.Tx, conversationID string) error {
	if r.indexer == nil {
		return nil
	}

	var conversation Conversation
	err := tx.QueryRow(`
		SELECT id, workspace_id, title, created_at, updated_at
		FROM chat_conversations WHERE id = ?
	`, conversationID).Scan(
		&conversation.ID, &conversation.WorkspaceID, &conversation.Title,
		&conversation.CreatedAt, &conversation.UpdatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}

	rows, err := tx.Query(
		`SELECT content FROM chat_messages WHERE conversation_id = ? ORDER BY position`,
		conversationID,
	)
	if err != nil {
		return err
	}
	defer rows.Close()

	// Both sides of the conversation. A question is as searchable as its
	// answer, and often more memorable — it is the thing the person typed.
	var body strings.Builder
	for rows.Next() {
		var content string
		if err := rows.Scan(&content); err != nil {
			return err
		}
		if content == "" {
			continue
		}
		if body.Len() > 0 {
			body.WriteString("\n\n")
		}
		body.WriteString(content)
	}
	if err := rows.Err(); err != nil {
		return err
	}

	return r.indexer.ReplaceTx(tx, search.IndexEntry{
		EntityType:  SearchEntityType,
		EntityID:    conversation.ID,
		WorkspaceID: conversation.WorkspaceID,
		Title:       conversation.Title,
		Body:        body.String(),
		CreatedAt:   conversation.CreatedAt,
		UpdatedAt:   conversation.UpdatedAt,
	})
}

// scanner is what Row and Rows have in common, so one scan serves both.
type scanner interface {
	Scan(dest ...any) error
}

func scanMessage(row scanner) (Message, error) {
	var message Message
	var toolCalls string

	if err := row.Scan(
		&message.ID, &message.ConversationID, &message.Role, &message.Content,
		&message.Position, &message.Model, &message.Wire,
		&message.InputTokens, &message.OutputTokens,
		&message.Status, &message.ErrorMessage, &message.CreatedAt, &toolCalls,
	); err != nil {
		return Message{}, err
	}

	calls, err := decodeToolCalls(toolCalls)
	if err != nil {
		return Message{}, err
	}
	message.ToolCalls = calls

	return message, nil
}

// The empty string is what every row written before the column existed holds,
// and what a turn that called nothing holds now. Both mean the same thing, so
// neither is an error.
func decodeToolCalls(stored string) ([]ToolCall, error) {
	if stored == "" {
		return nil, nil
	}

	var calls []ToolCall
	if err := json.Unmarshal([]byte(stored), &calls); err != nil {
		return nil, fmt.Errorf("decode tool calls: %w", err)
	}

	return calls, nil
}

// encodeToolCalls stores nothing as the empty string rather than as "null",
// so that a turn with no calls reads back the same however it was written.
func encodeToolCalls(calls []ToolCall) (string, error) {
	if len(calls) == 0 {
		return "", nil
	}

	encoded, err := json.Marshal(calls)
	if err != nil {
		return "", fmt.Errorf("encode tool calls: %w", err)
	}

	return string(encoded), nil
}

func (r *Repository) Detail(conversationID string) (ConversationDetail, error) {
	conversation, err := r.GetConversation(conversationID)
	if err != nil {
		return ConversationDetail{}, err
	}

	messages, err := r.Messages(conversationID)
	if err != nil {
		return ConversationDetail{}, err
	}

	return ConversationDetail{Conversation: conversation, Messages: messages}, nil
}

// Append adds a turn to the end of a conversation.
//
// Position and the conversation's updated_at are set here rather than by the
// caller, and in one transaction, because they are the two facts that must not
// disagree with the row being inserted. A message appended without touching
// updated_at would leave the thread sorted as though nothing had happened.
func (r *Repository) Append(conversationID string, message Message) (Message, error) {
	if message.Role != RoleUser && message.Role != RoleAssistant {
		return Message{}, fmt.Errorf("%w: unknown role %q", ErrInvalidRequest, message.Role)
	}

	transaction, err := r.db.Begin()
	if err != nil {
		return Message{}, err
	}
	defer func() { _ = transaction.Rollback() }()

	// Confirms the conversation exists inside the same transaction that will
	// write to it. Checking beforehand would be a race with a delete.
	var exists string
	err = transaction.QueryRow(
		`SELECT id FROM chat_conversations WHERE id = ?`, conversationID,
	).Scan(&exists)
	if errors.Is(err, sql.ErrNoRows) {
		return Message{}, ErrConversationNotFound
	}
	if err != nil {
		return Message{}, err
	}

	// COALESCE because MAX over no rows is NULL rather than 0, which is what
	// the first message of every conversation would hit.
	var position int
	if err := transaction.QueryRow(
		`SELECT COALESCE(MAX(position), -1) + 1 FROM chat_messages WHERE conversation_id = ?`,
		conversationID,
	).Scan(&position); err != nil {
		return Message{}, err
	}

	stored := message
	stored.ID = r.nextID()
	stored.ConversationID = conversationID
	stored.Position = position
	stored.CreatedAt = r.timestamp()
	if stored.Status == "" {
		stored.Status = StatusOK
	}

	toolCalls, err := encodeToolCalls(stored.ToolCalls)
	if err != nil {
		return Message{}, err
	}

	if _, err := transaction.Exec(`
		INSERT INTO chat_messages (
			id, conversation_id, role, content, position,
			model, wire, input_tokens, output_tokens,
			status, error_message, created_at, tool_calls
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, stored.ID, stored.ConversationID, stored.Role, stored.Content, stored.Position,
		stored.Model, stored.Wire, stored.InputTokens, stored.OutputTokens,
		stored.Status, stored.ErrorMessage, stored.CreatedAt, toolCalls); err != nil {
		return Message{}, err
	}

	// A conversation with no title takes one from its first user turn.
	title := ""
	if stored.Role == RoleUser && stored.Position == 0 {
		title = DeriveTitle(stored.Content)
	}

	if _, err := transaction.Exec(`
		UPDATE chat_conversations
		SET updated_at = ?,
		    title = CASE WHEN title = '' THEN ? ELSE title END
		WHERE id = ?
	`, stored.CreatedAt, title, conversationID); err != nil {
		return Message{}, err
	}

	// Inside the same transaction that wrote the turn. An index updated after
	// the commit is an index that is wrong whenever the commit is the thing
	// that failed.
	if err := r.reindexTx(transaction, conversationID); err != nil {
		return Message{}, err
	}

	if err := transaction.Commit(); err != nil {
		return Message{}, err
	}

	return stored, nil
}

// Finish completes an assistant turn once its stream has ended.
//
// The row is written empty when the stream opens and filled in here, rather
// than only being written on success. That ordering is what makes a failed
// stream recoverable: the turn already exists, so whatever text arrived before
// the failure has somewhere to live.
func (r *Repository) Finish(messageID string, message Message) (Message, error) {
	status := message.Status
	if status == "" {
		status = StatusOK
	}

	toolCalls, err := encodeToolCalls(message.ToolCalls)
	if err != nil {
		return Message{}, err
	}

	transaction, err := r.db.Begin()
	if err != nil {
		return Message{}, err
	}
	defer func() { _ = transaction.Rollback() }()

	result, err := transaction.Exec(`
		UPDATE chat_messages
		SET content = ?, model = ?, wire = ?,
		    input_tokens = ?, output_tokens = ?,
		    status = ?, error_message = ?, tool_calls = ?
		WHERE id = ?
	`, message.Content, message.Model, message.Wire,
		message.InputTokens, message.OutputTokens,
		status, message.ErrorMessage, toolCalls, messageID)
	if err != nil {
		return Message{}, err
	}

	changed, err := result.RowsAffected()
	if err != nil {
		return Message{}, err
	}
	if changed == 0 {
		return Message{}, ErrMessageNotFound
	}

	// The reply's text arrives here, not at Append — the row was written empty.
	// Without this the index would hold every question and no answer.
	var conversationID string
	if err := transaction.QueryRow(
		`SELECT conversation_id FROM chat_messages WHERE id = ?`, messageID,
	).Scan(&conversationID); err != nil {
		return Message{}, err
	}
	if err := r.reindexTx(transaction, conversationID); err != nil {
		return Message{}, err
	}

	if err := transaction.Commit(); err != nil {
		return Message{}, err
	}

	return r.message(messageID)
}

func (r *Repository) message(id string) (Message, error) {
	message, err := scanMessage(r.db.QueryRow(
		`SELECT `+messageColumns+` FROM chat_messages WHERE id = ?`, id,
	))
	if errors.Is(err, sql.ErrNoRows) {
		return Message{}, ErrMessageNotFound
	}
	if err != nil {
		return Message{}, err
	}

	return message, nil
}

func (r *Repository) Rename(id, title string) (Conversation, error) {
	clean := strings.TrimSpace(title)
	if clean == "" {
		return Conversation{}, fmt.Errorf("%w: title is required", ErrInvalidRequest)
	}

	transaction, err := r.db.Begin()
	if err != nil {
		return Conversation{}, err
	}
	defer func() { _ = transaction.Rollback() }()

	result, err := transaction.Exec(
		`UPDATE chat_conversations SET title = ? WHERE id = ?`, clean, id,
	)
	if err != nil {
		return Conversation{}, err
	}

	changed, err := result.RowsAffected()
	if err != nil {
		return Conversation{}, err
	}
	if changed == 0 {
		return Conversation{}, ErrConversationNotFound
	}

	// The title is what a search result is headed with, so a rename that did
	// not reach the index would leave the old name on the hit.
	if err := r.reindexTx(transaction, id); err != nil {
		return Conversation{}, err
	}

	if err := transaction.Commit(); err != nil {
		return Conversation{}, err
	}

	return r.GetConversation(id)
}

// Delete removes a conversation and its messages.
//
// The messages are deleted explicitly even though the schema declares ON DELETE
// CASCADE and the service now opens its database with that enforced. SQLite
// applies the cascade only when PRAGMA foreign_keys is on for the connection,
// and a repository does not get to assume how the database it was handed was
// opened — the tests below hand it one where it is off, which is exactly the
// case where trusting the cascade would leave every message behind. Under
// enforcement the cascade has already run and this deletes nothing.
func (r *Repository) Delete(id string) error {
	transaction, err := r.db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = transaction.Rollback() }()

	result, err := transaction.Exec(`DELETE FROM chat_conversations WHERE id = ?`, id)
	if err != nil {
		return err
	}

	changed, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if changed == 0 {
		return ErrConversationNotFound
	}

	if _, err := transaction.Exec(
		`DELETE FROM chat_messages WHERE conversation_id = ?`, id,
	); err != nil {
		return err
	}

	// A hit that opens nothing is worse than no hit.
	if r.indexer != nil {
		if err := r.indexer.DeleteTx(transaction, SearchEntityType, id); err != nil {
			return err
		}
	}

	return transaction.Commit()
}
