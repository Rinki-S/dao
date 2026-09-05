-- +goose Up
-- A reasoning model's working across the steps of a turn that asked for a
-- tool, kept so the turn can be replayed later without losing it.
--
-- The propose-then-apply flow reloads a turn from this table and replays it
-- to the model days after it was written. DeepSeek's deepseek-reasoner — a
-- real endpoint this was found against, not a hypothetical one — refuses that
-- replay with a 400 unless the reasoning that produced a tool call travels
-- back with the message carrying it. The Anthropic wire never needed this:
-- reasoning there is not requested in this build, so nothing has ever
-- returned any to keep.
--
-- Empty on every existing row, which is right: none of them can be replayed
-- to a reasoning model that will ask for it, because none of them have it.
ALTER TABLE chat_messages
ADD COLUMN reasoning TEXT NOT NULL DEFAULT '';

-- +goose Down
-- SQLite cannot drop columns without rebuilding the table.
