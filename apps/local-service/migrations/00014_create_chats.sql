-- +goose Up
-- A conversation with a model, kept as rows rather than as a file.
--
-- Notes and tasks are files because they are prose the user writes and edits.
-- A transcript is not: it is a record of turns that already happened, each
-- with a role, a moment, and a model behind it. Nobody hand-edits the eighth
-- turn of a chat, so the reasons that moved tasks out of the database do not
-- transfer here.
CREATE TABLE chat_conversations (
    id TEXT PRIMARY KEY,

    -- No REFERENCES workspaces(id), and not by oversight.
    --
    -- Adding it now would mean rebuilding this table, and under the foreign
    -- keys the database enforces since 00015's neighbour, dropping
    -- chat_conversations runs an implicit DELETE FROM — which the ON DELETE
    -- CASCADE below would answer by removing every message in the database.
    --
    -- The rule is kept in the repository instead, where it can also refuse a
    -- workspace that has been soft-deleted. A foreign key only asks whether the
    -- row is there, and a deleted workspace's row is still there.
    workspace_id TEXT NOT NULL,

    -- Empty until there is something to name it after. A conversation is
    -- created by sending the first message, and the title is derived from
    -- that message rather than asked for up front.
    title TEXT NOT NULL DEFAULT '',

    created_at TEXT NOT NULL,

    -- Touched by every new message, because the list is ordered by activity
    -- rather than by when a conversation was started.
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_workspace_updated
ON chat_conversations(workspace_id, updated_at DESC);

CREATE TABLE chat_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL
        REFERENCES chat_conversations(id) ON DELETE CASCADE,

    -- 'user' | 'assistant'. The system prompt is not a row: it belongs to the
    -- build that sent it, and storing it per turn would claim a history the
    -- app cannot honour once the prompt changes.
    role TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',

    -- Turn order, explicit rather than inferred.
    --
    -- created_at is RFC3339 with second precision, and a reply to a local
    -- model can land in the same second as the message that prompted it. A
    -- transcript rendered in the wrong order is wrong in a way that looks like
    -- the model answered a question it had not been asked, so the order is
    -- recorded rather than derived.
    position INTEGER NOT NULL,

    -- Which model produced an assistant turn. Recorded per message, not per
    -- conversation: the user can change provider between turns, and a
    -- transcript that claims one model wrote all of it would be a lie.
    model TEXT NOT NULL DEFAULT '',
    wire TEXT NOT NULL DEFAULT '',

    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,

    -- 'ok' | 'failed'. A stream that dies halfway leaves real text behind, and
    -- discarding it would lose the answer while keeping the question. The
    -- partial content stays, marked for what it is.
    status TEXT NOT NULL DEFAULT 'ok',
    error_message TEXT NOT NULL DEFAULT '',

    created_at TEXT NOT NULL,

    -- Two turns of one conversation cannot claim the same place in it.
    UNIQUE (conversation_id, position)
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation
ON chat_messages(conversation_id, position);

-- +goose Down
DROP INDEX IF EXISTS idx_chat_messages_conversation;

DROP TABLE IF EXISTS chat_messages;

DROP INDEX IF EXISTS idx_chat_conversations_workspace_updated;

DROP TABLE IF EXISTS chat_conversations;
