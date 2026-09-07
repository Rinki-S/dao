// Package database opens the service's SQLite database.
//
// One function, which exists so that there is exactly one place where the
// connection settings live. The settings below are not defaults — SQLite's
// default for the first of them is off, and six migrations were written as
// though it were not.
package database

import (
	"database/sql"

	_ "modernc.org/sqlite"
)

// The pragmas every connection is opened with.
//
// foreign_keys is off by default in SQLite, for backward compatibility with
// databases written before it existed. The effect is quiet: a REFERENCES
// clause parses, is stored, is reported by the schema, and does nothing. Six
// migrations here declare foreign keys that have never once been checked, and
// an ON DELETE CASCADE that has never once fired.
//
// Given in the DSN rather than executed after opening, because database/sql
// hands out a pool of connections and a pragma is per-connection. `db.Exec("PRAGMA
// foreign_keys = ON")` sets it on whichever connection happened to serve that
// call and leaves every other one — including every connection opened later,
// under load, when the pool grows — with it off. That failure is invisible
// until the day a write that should have been refused is not.
const pragmas = "?_pragma=foreign_keys(1)"

// Open connects to the database at path.
//
// Turning enforcement on does not reject rows that are already there: the
// pragma governs statements from here on, and a database carrying an orphan
// from before keeps it until something writes to it. PRAGMA foreign_key_check
// is the way to go looking for those.
func Open(path string) (*sql.DB, error) {
	return sql.Open("sqlite", path+pragmas)
}
