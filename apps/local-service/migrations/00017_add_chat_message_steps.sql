-- +goose Up
-- How many times the model was asked to produce this turn.
--
-- A turn used to be one run of the loop, bounded at eight steps, and nobody
-- needed to know afterwards how many of those it used. A turn can now be picked
-- up again: the model proposes a change, stops, and carries on once somebody has
-- decided — and each continuation is a fresh run with a fresh bound.
--
-- Left alone, the bound would stop meaning anything. Propose, apply, propose,
-- apply is a loop with no end that spends the user's money on every lap, and
-- eight steps at a time is not a limit on it. Recording what each run cost is
-- what lets the next one be given only what is left of the turn's allowance.
--
-- Zero on every existing row, which is right: they were not resumable, so
-- nothing will ever ask what they spent.
ALTER TABLE chat_messages
ADD COLUMN steps INTEGER NOT NULL DEFAULT 0;

-- +goose Down
-- SQLite cannot drop columns without rebuilding the table.
