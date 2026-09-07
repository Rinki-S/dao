-- +goose Up
-- What was attached to a turn, as JSON: a path, a name, a media type, and the
-- size and modification time the file had at the moment it was attached.
--
-- Not the file. Attachments are not copied anywhere — the one on disk stays
-- the only copy — so this column records where it was rather than what was in
-- it. That choice is why the last two fields are here: on a later turn the
-- file is read again, and size and mtime together are what say whether what
-- comes back is what was actually sent. Without them the app would re-read
-- whatever now sits at that path and present it as what somebody attached,
-- which is the one way a transcript can lie about its own contents.
--
-- The consequence to know about: a file that is moved, deleted or edited
-- cannot be replayed, and the turn says so instead. That is the price of not
-- copying, and it is paid in words rather than in silence.
--
-- Empty on every existing row, which is right: nothing could be attached
-- before this column existed.
ALTER TABLE chat_messages
ADD COLUMN attachments TEXT NOT NULL DEFAULT '';

-- +goose Down
-- SQLite cannot drop columns without rebuilding the table.
