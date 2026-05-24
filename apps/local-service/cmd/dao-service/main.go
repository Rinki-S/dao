package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/pressly/goose/v3"
	"github.com/rinki-s/dao/apps/local-service/internal/modules/activities"
	"github.com/rinki-s/dao/apps/local-service/internal/modules/notes"
	"github.com/rinki-s/dao/apps/local-service/internal/modules/projects"
	"github.com/rinki-s/dao/apps/local-service/internal/modules/search"
	"github.com/rinki-s/dao/apps/local-service/internal/modules/tasks"
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

	activityRepo := activities.NewRepository(db)
	activityHandler := activities.NewHandler(activityRepo)
	activityHandler.RegisterRoutes(apiMux)

	searchRepo := search.NewRepository(db)

	workspaceRepo := workspaces.NewRepository(db, activityRepo)
	workspaceHandler := workspaces.NewHandler(workspaceRepo)
	workspaceHandler.RegisterRoutes(apiMux)

	projectRepo := projects.NewRepository(db, searchRepo, activityRepo)
	projectHandler := projects.NewHandler(projectRepo)
	projectHandler.RegisterRoutes(apiMux)

	taskRepo := tasks.NewRepository(db, searchRepo, activityRepo)
	taskHandler := tasks.NewHandler(taskRepo)
	taskHandler.RegisterRoutes(apiMux)

	noteRepo := notes.NewRepository(db, searchRepo, activityRepo)
	noteHandler := notes.NewHandler(noteRepo)
	noteHandler.RegisterRoutes(apiMux)

	searchHandler := search.NewHandler(searchRepo)
	searchHandler.RegisterRoutes(apiMux)

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
	server := &http.Server{
		Addr:    addr,
		Handler: mux,
	}

	log.Printf("dao local service listening on http://%s", addr)

	go func() {
		shutdownSignals := make(chan os.Signal, 1)
		signal.Notify(shutdownSignals, os.Interrupt, syscall.SIGTERM)
		<-shutdownSignals

		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		if err := server.Shutdown(shutdownCtx); err != nil {
			log.Printf("dao local service shutdown failed: %v", err)
		}
	}()

	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
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
