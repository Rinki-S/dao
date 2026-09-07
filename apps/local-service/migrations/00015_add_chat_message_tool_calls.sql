-- +goose Up
-- What the model did before it answered.
--
-- Kept because the question this app has to be able to answer about itself is
-- "did it read my notes?", and an answer that only exists in the stream is one
-- that disappears on reload. A transcript that shows the reply but not the
-- three notes it was drawn from is a record of half of what happened.
--
-- A JSON array of {name, input} on the assistant turn that made the calls,
-- rather than rows of its own. There is no query that wants tool calls across
-- conversations — they are read exactly once, with the turn they belong to, and
-- a table would be a join for nothing.
ALTER TABLE chat_messages
ADD COLUMN tool_calls TEXT NOT NULL DEFAULT '';

-- +goose Down
-- SQLite cannot drop columns without rebuilding the table.
