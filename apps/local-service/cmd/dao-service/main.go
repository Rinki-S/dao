package main

import (
	"database/sql"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"github.com/pressly/goose/v3"
	"github.com/rinki-s/dao/apps/local-service/internal/modules/workspaces"

	_ "modernc.org/sqlite"
)

func main() {
	port := flag.String("port", "3766", "local service port")
	token := flag.String("token", "", "local session token")
	flag.Parse()

	db, err := openDatabase()
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	if err := runMigrations(db); err != nil {
		log.Fatal(err)
	}

	apiMux := http.NewServeMux()

	workspaceRepo := workspaces.NewRepository(db)
	workspaceHandler := workspaces.NewHandler(workspaceRepo)
	workspaceHandler.RegisterRoutes(apiMux)

	mux := http.NewServeMux()
	mux.Handle("/api/", requireToken(*token, apiMux))
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		json.NewEncoder(w).Encode(map[string]string{
			"status":   "ok",
			"service":  "dao-local-service",
			"database": "connected",
		})
	})

	addr := fmt.Sprintf("127.0.0.1:%s", *port)

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

func requireToken(token string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if token == "" {
			next.ServeHTTP(w, r)
			return
		}

		expected := "Bearer " + token
		if r.Header.Get("Authorization") != expected {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		next.ServeHTTP(w, r)
	})
}
