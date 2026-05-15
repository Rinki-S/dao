package main

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"github.com/pressly/goose/v3"

	_ "modernc.org/sqlite"
)

func main() {
	db, err := openDatabase()
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	if err := runMigrations(db); err != nil {
		log.Fatal(err)
	}

	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		json.NewEncoder(w).Encode(map[string]string{
			"status":   "ok",
			"service":  "dao-local-service",
			"database": "connected",
		})
	})

	addr := "127.0.0.1:3766"

	log.Printf("dao local service listening on http://%s", addr)

	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}

func openDatabase() (*sql.DB, error) {
	dataDir := "data"

	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, err
	}

	dbPath := filepath.Join(dataDir, "dao.db")

	return sql.Open("sqlite", dbPath)
}

func runMigrations(db *sql.DB) error {
	if err := goose.SetDialect("sqlite3"); err != nil {
		return err
	}

	return goose.Up(db, "migrations")
}
