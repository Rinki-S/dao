-- +goose Up
-- One row per AI run, written whether the run succeeded or not.
--
-- The columns are chosen so a finished trace can answer "why did it say
-- that?" without the run being repeatable: the exact context that was sent,
-- the exact text that came back, and what happened to it afterwards. A
-- summary is not reproducible — the same input to the same model gives a
-- different answer tomorrow — so anything not recorded here is lost.
CREATE TABLE ai_traces (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,

    -- Which run this was: 'summarize-today' and whatever follows it.
    feature TEXT NOT NULL,

    -- Bumped whenever the prompt changes. Without it, a trace from an older
    -- build looks like it was produced by the prompt in the current source.
    prompt_version TEXT NOT NULL,

    -- Where it was sent. The key is not here, and never will be.
    wire TEXT NOT NULL,
    model TEXT NOT NULL,

    -- The serialised llm.Context, verbatim. A description of the input would
    -- not answer the question the trace exists to answer.
    request_json TEXT NOT NULL,

    -- What the model wrote, before parsing. Kept separately from the parsed
    -- output because the interesting failures are the ones where these two
    -- disagree.
    response_text TEXT NOT NULL DEFAULT '',
    output_json TEXT NOT NULL DEFAULT '',

    -- How many times the model was asked. More than one means the first
    -- answer failed validation, which is a fact about the prompt.
    attempts INTEGER NOT NULL DEFAULT 1,

    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,

    -- 'ok' | 'invalid' | 'failed'. Invalid means the model answered and the
    -- answer did not validate; failed means it never answered.
    status TEXT NOT NULL,
    error_message TEXT NOT NULL DEFAULT '',

    -- Null until a human acts on a run that offered to change something.
    confirmed_at TEXT,

    created_at TEXT NOT NULL
);

-- Traces are read newest-first for one workspace, which is the only way the
-- app ever asks for them.
CREATE INDEX IF NOT EXISTS idx_ai_traces_workspace_created
ON ai_traces(workspace_id, created_at DESC);

-- +goose Down
DROP INDEX IF EXISTS idx_ai_traces_workspace_created;

DROP TABLE IF EXISTS ai_traces;
