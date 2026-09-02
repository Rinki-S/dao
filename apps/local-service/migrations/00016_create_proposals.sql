-- +goose Up
-- A change the model wants to make, and has not made.
--
-- A writing tool does not write. It works out exactly what the change would be,
-- records it here, and stops — so that what a person is shown, what they agree
-- to, and what is finally written to the file are the same thing rather than
-- three descriptions of it. The summary run already works this way, for the
-- same reason: a confirmation that trusts its own payload confirms nothing.
CREATE TABLE proposals (
    id TEXT PRIMARY KEY,

    -- No REFERENCES workspaces(id), for the reason chat_conversations gives at
    -- length: the rule lives in the repository, where it can also refuse a
    -- workspace that has been soft-deleted.
    workspace_id TEXT NOT NULL,

    conversation_id TEXT NOT NULL
        REFERENCES chat_conversations(id) ON DELETE CASCADE,

    -- The model's own id for the call that proposed this.
    --
    -- The join to the transcript, and not by way of a message id: the proposal
    -- is written while the tool runs, and the assistant row it belongs to is
    -- not stored until the turn ends. This is what is known at the time, and it
    -- is enough — it is also the id the eventual tool result has to answer.
    tool_call_id TEXT NOT NULL,

    -- Which of the writing tools asked. Determines how the change is shown:
    -- there is no diff to draw for a note being created, and no content to
    -- compare for one being renamed.
    kind TEXT NOT NULL,

    -- The note this is about, empty when the proposal is to create one.
    target_id TEXT NOT NULL DEFAULT '',

    -- The title a created or renamed note would have.
    title TEXT NOT NULL DEFAULT '',

    -- What the file says now, and what it would say.
    --
    -- Both texts rather than a diff between them, so there is one source: the
    -- apply writes after_text, the interface shows the difference between the
    -- two, and neither can drift from the other. Named with a suffix because
    -- BEFORE and AFTER are SQLite keywords.
    before_text TEXT NOT NULL DEFAULT '',
    after_text TEXT NOT NULL DEFAULT '',

    -- What the note's updated_at said when this was worked out.
    --
    -- The same expectation a save from the editor carries, and it is checked
    -- the same way. A proposal is a plan made against a file at a moment; if
    -- the file has moved on since, applying it would write over whatever
    -- happened in between.
    expected_updated_at TEXT NOT NULL DEFAULT '',

    -- 'pending' | 'applied' | 'discarded'.
    --
    -- Discarded covers two different things on purpose: a person saying no, and
    -- a person walking away — sending another message abandons whatever was
    -- waiting, because a tool call left unanswered makes the whole transcript
    -- unreadable to the model.
    status TEXT NOT NULL DEFAULT 'pending',

    -- What the model was told when this was resolved, which becomes the result
    -- of the call that proposed it.
    outcome TEXT NOT NULL DEFAULT '',

    created_at TEXT NOT NULL,
    resolved_at TEXT,

    -- One call proposes one change.
    UNIQUE (conversation_id, tool_call_id)
);

-- Every read is "what is still waiting in this conversation", in the order it
-- was proposed.
CREATE INDEX IF NOT EXISTS idx_proposals_conversation
ON proposals(conversation_id, created_at);

-- +goose Down
DROP INDEX IF EXISTS idx_proposals_conversation;

DROP TABLE IF EXISTS proposals;
