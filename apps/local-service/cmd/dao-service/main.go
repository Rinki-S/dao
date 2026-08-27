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

	"github.com/oklog/ulid/v2"
	"github.com/pressly/goose/v3"
	"github.com/rinki-s/dao/apps/local-service/internal/ai/harness"
	"github.com/rinki-s/dao/apps/local-service/internal/ai/trace"
	"github.com/rinki-s/dao/apps/local-service/internal/modules/activities"
	"github.com/rinki-s/dao/apps/local-service/internal/modules/ai"
	"github.com/rinki-s/dao/apps/local-service/internal/modules/chats"
	"github.com/rinki-s/dao/apps/local-service/internal/modules/notes"
	"github.com/rinki-s/dao/apps/local-service/internal/modules/projects"
	"github.com/rinki-s/dao/apps/local-service/internal/modules/search"
	"github.com/rinki-s/dao/apps/local-service/internal/modules/settings"
	"github.com/rinki-s/dao/apps/local-service/internal/modules/tasks"
	"github.com/rinki-s/dao/apps/local-service/internal/modules/workspaces"

	_ "modernc.org/sqlite"
)

func main() {
	port := flag.String("port", "3766", "local service port")
	token := flag.String("token", "", "local session token")
	flag.Parse()

	// From the environment rather than a flag: a process's arguments are
	// readable by every user on the machine through ps, and this is a
	// credential for a paid third-party account. The desktop app keeps it
	// encrypted and hands it over at startup; this process only ever holds it
	// in memory, for as long as it runs.
	// The kind travels beside it because the same string is presented
	// differently depending on what it is: a key goes in the wire's own header,
	// an access token always goes in an Authorization bearer header.
	modelCredentials := ai.NewCredentials(
		os.Getenv("DAO_MODEL_CREDENTIAL_KIND"),
		os.Getenv("DAO_MODEL_API_KEY"),
	)

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

	settingsRepo := settings.NewRepository(db)
	settingsHandler := settings.NewHandler(settingsRepo)
	settingsHandler.RegisterRoutes(apiMux)

	aiRepo := ai.NewRepository(db)
	aiHandler := ai.NewHandler(aiRepo, modelCredentials)

	workspaceRepo := workspaces.NewRepository(db, activityRepo, settingsRepo)
	workspaceHandler := workspaces.NewHandler(workspaceRepo)
	workspaceHandler.RegisterRoutes(apiMux)

	projectRepo := projects.NewRepository(db, searchRepo, activityRepo)
	projectHandler := projects.NewHandler(projectRepo)
	projectHandler.RegisterRoutes(apiMux)

	taskRepo := tasks.NewRepository(db, searchRepo, activityRepo)
	taskHandler := tasks.NewHandler(taskRepo)
	taskHandler.RegisterRoutes(apiMux)

	// Tasks used to be table rows. Their destination is a file, which SQL
	// cannot write, so this runs here rather than as a goose migration.
	if err := tasks.MigrateRowsToDocuments(db, taskRepo); err != nil {
		log.Fatal(err)
	}

	noteRepo := notes.NewRepository(db, searchRepo, activityRepo)
	noteHandler := notes.NewHandler(noteRepo)
	noteHandler.RegisterRoutes(apiMux)

	searchHandler := search.NewHandler(searchRepo)
	searchHandler.RegisterRoutes(apiMux)

	// Chat reaches the model through the ai handler's two functions rather than
	// through the ai module itself. Which provider is configured, and whether it
	// still is a minute from now, stays one module's business; chat is handed
	// the ability to ask, not the settings behind it.
	chats.NewHandler(
		chats.NewRepository(db, func() string { return ulid.Make().String() }),
		aiHandler.Client,
		aiHandler.Describe,
	).RegisterRoutes(apiMux)

	// Registered last: the harness reads notes and tasks, so it is wired once
	// the repositories that own them exist.
	aiHandler.WithHarness(
		harness.NewGatherer(db, func(workspaceID string) (string, time.Time, error) {
			document, err := taskRepo.Get(workspaceID)
			if err != nil {
				return "", time.Time{}, err
			}
			updatedAt, err := time.Parse(time.RFC3339, document.UpdatedAt)
			if err != nil {
				return "", time.Time{}, err
			}
			return document.Content, updatedAt, nil
		}),
		trace.NewRepository(db, func() string { return ulid.Make().String() }),
		func(workspaceID, title, content string) (string, error) {
			// At the workspace root, as a plain Markdown note. A saved summary
			// is a note like any other once it exists.
			note, err := noteRepo.Create(notes.CreateNoteRequest{
				WorkspaceID: workspaceID,
				Title:       title,
				Content:     content,
				ContentType: "markdown",
				NoteType:    "general",
			})
			if err != nil {
				return "", err
			}
			return note.ID, nil
		},
	).RegisterRoutes(apiMux)

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
