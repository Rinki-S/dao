package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
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
	"github.com/rinki-s/dao/apps/local-service/internal/ai/agent"
	"github.com/rinki-s/dao/apps/local-service/internal/ai/harness"
	"github.com/rinki-s/dao/apps/local-service/internal/ai/tools"
	"github.com/rinki-s/dao/apps/local-service/internal/ai/trace"
	"github.com/rinki-s/dao/apps/local-service/internal/database"
	"github.com/rinki-s/dao/apps/local-service/internal/events"
	"github.com/rinki-s/dao/apps/local-service/internal/files"
	"github.com/rinki-s/dao/apps/local-service/internal/modules/activities"
	"github.com/rinki-s/dao/apps/local-service/internal/modules/ai"
	"github.com/rinki-s/dao/apps/local-service/internal/modules/chats"
	"github.com/rinki-s/dao/apps/local-service/internal/modules/notes"
	"github.com/rinki-s/dao/apps/local-service/internal/modules/projects"
	"github.com/rinki-s/dao/apps/local-service/internal/modules/proposals"
	"github.com/rinki-s/dao/apps/local-service/internal/modules/search"
	"github.com/rinki-s/dao/apps/local-service/internal/modules/settings"
	"github.com/rinki-s/dao/apps/local-service/internal/modules/tasks"
	"github.com/rinki-s/dao/apps/local-service/internal/modules/workspaces"
	"github.com/rinki-s/dao/apps/local-service/internal/watch"

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

	// Names used to end in the row's identifier. Renaming files is not
	// something SQL can do either, so this is here for the same reason — and
	// it does nothing once the names are already plain.
	if err := files.StripIdentifiers(db); err != nil {
		log.Fatal(err)
	}

	noteRepo := notes.NewRepository(db, searchRepo, activityRepo)
	noteHandler := notes.NewHandler(noteRepo)
	noteHandler.RegisterRoutes(apiMux)

	searchHandler := search.NewHandler(searchRepo)
	searchHandler.RegisterRoutes(apiMux)

	// The workspace folder is a place the user is invited to open, so the app
	// has to cope with them doing so. Failing to watch is not failing to start:
	// an app that will not open because a folder moved is worse than one whose
	// live updates stopped.
	watchCtx, stopWatching := context.WithCancel(context.Background())
	defer stopWatching()

	broker := events.NewBroker()
	events.NewHandler(broker).RegisterRoutes(apiMux)

	if roots, err := workspaceRoots(db); err != nil {
		log.Printf("workspace roots: %v", err)
	} else if _, err := watch.Watch(watchCtx, roots, watch.Options{
		OnChange: func(paths []string) {
			changed, err := noteRepo.Reconcile(paths)
			if err != nil {
				log.Printf("reconcile: %v", err)
			}
			// Only when something actually changed. A batch that turned out to
			// be the app's own footprints would otherwise have the window
			// reload in response to its own save.
			if changed {
				broker.Publish(events.WorkspaceChanged)
			}
		},
	}); err != nil {
		log.Printf("watch workspace: %v", err)
	}

	// Chat reaches the model through the ai handler's two functions rather than
	// through the ai module itself. Which provider is configured, and whether it
	// still is a minute from now, stays one module's business; chat is handed
	// the ability to ask, not the settings behind it.
	proposalRepo := proposals.NewRepository(db)

	chats.NewHandler(
		chats.NewRepository(db, func() string { return ulid.Make().String() }, searchRepo).
			WithProposals(proposalRepo),
		aiHandler.Client,
		aiHandler.Describe,
	).
		WithTools(workspaceTools(searchRepo, noteRepo, taskRepo, proposalRepo)).
		WithProposals(proposalRepo, applyChange(noteRepo)).
		RegisterRoutes(apiMux)

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

// workspaceTools builds the tools a chat in one workspace is given.
//
// The workspace comes from the conversation the request is for, and closes over
// every function below. There is no argument by which a model could name a
// different one, and this is the only place that could stop being true. The
// conversation is bound the same way and for the same reason: a change the
// model prepares waits in the conversation that asked for it, and neither the
// model nor a later request can name a different one.
func workspaceTools(
	searchRepo *search.Repository,
	noteRepo *notes.Repository,
	taskRepo *tasks.Repository,
	proposalRepo *proposals.Repository,
) func(string, string) []agent.Tool {
	return func(workspaceID string, conversationID string) []agent.Tool {
		return tools.New(tools.Workspace{
			SearchNotes: func(query string) ([]tools.NoteMatch, error) {
				results, err := searchRepo.Search(query)
				if err != nil {
					return nil, err
				}

				// The index holds tasks and projects too, and every workspace's.
				// Both filters are here rather than in the tool, because what a
				// row in the index means is this module's business.
				matches := []tools.NoteMatch{}
				for _, result := range results {
					if result.EntityType != "note" || result.WorkspaceID != workspaceID {
						continue
					}
					matches = append(matches, tools.NoteMatch{
						ID:      result.EntityID,
						Title:   result.Title,
						Snippet: result.Snippet,
					})
				}

				return matches, nil
			},
			ReadNote: func(id string) (tools.NoteContent, error) {
				note, err := noteRepo.Get(id)
				if err != nil {
					return tools.NoteContent{}, err
				}
				// Checked after reading rather than in the query, so that a note
				// in another workspace is refused rather than returned. An id
				// found by search is always in this workspace; one the model
				// invented or remembered from earlier need not be.
				if note.WorkspaceID != workspaceID {
					return tools.NoteContent{}, fmt.Errorf("no note %q in this workspace", id)
				}

				return tools.NoteContent{
					Title:     note.Title,
					Content:   note.Content,
					UpdatedAt: note.UpdatedAt,
				}, nil
			},
			ReadTasks: func() (string, error) {
				document, err := taskRepo.Get(workspaceID)
				if err != nil {
					return "", err
				}

				return document.Content, nil
			},
			// The one thing that lets the model ask to change anything, and it
			// only records the asking. Nothing here writes.
			Propose: func(change tools.Proposed) error {
				request := proposals.CreateRequest{
					WorkspaceID:       workspaceID,
					ConversationID:    conversationID,
					ToolCallID:        change.ToolCallID,
					Kind:              change.Kind,
					TargetID:          change.TargetID,
					Title:             change.Title,
					Before:            change.Before,
					After:             change.After,
					ExpectedUpdatedAt: change.ExpectedUpdatedAt,
				}

				// A change against a note that exists is checked here as well as
				// when the tool read it, because this is the call that ends in
				// somebody's file being written. The read that came before it
				// proves nothing about the id in front of us now.
				//
				// And the title comes from the note rather than from the model,
				// so the question somebody is asked names the note the way their
				// own workspace does.
				if change.TargetID != "" {
					note, err := noteRepo.Get(change.TargetID)
					if err != nil || note.WorkspaceID != workspaceID {
						return fmt.Errorf("no note %q in this workspace", change.TargetID)
					}

					request.Title = note.Title
				}

				_, err := proposalRepo.Create(request)

				return err
			},
		})
	}
}

// applyChange writes a change somebody agreed to, and says what happened.
//
// The only place a proposal turns into a file being written, and it works from
// the stored row rather than from anything a request carried: what is written
// is what was shown. The expectation the proposal was worked out against is
// passed straight through to the same check a save from the editor goes through,
// so a note edited in between is refused here exactly as it would be there.
//
// What it returns is what the model is told, and it is written from what
// actually happened rather than from what was intended. A model told a change
// landed will go on describing the workspace as though it had.
func applyChange(noteRepo *notes.Repository) func(proposals.Proposal) (string, error) {
	return func(proposal proposals.Proposal) (string, error) {
		if proposal.Kind != proposals.KindEditNote {
			return "", fmt.Errorf("this build cannot apply a %q change", proposal.Kind)
		}

		_, err := noteRepo.UpdateContent(
			proposal.TargetID, proposal.After, proposal.ExpectedUpdatedAt,
		)

		var conflict *notes.Conflict
		if errors.As(err, &conflict) {
			// Not a failure of the change but of its moment. Said in those
			// terms so the model reads it and stops, rather than trying the
			// same replacement against a note that has moved on.
			return "", fmt.Errorf(
				"the note changed after this was prepared, so nothing was written. " +
					"Read it again before proposing anything else",
			)
		}
		if err != nil {
			return "", err
		}

		return fmt.Sprintf("The change to %q was applied.", proposal.Title), nil
	}
}

func openDatabase() (*sql.DB, error) {
	dataDir := "data"

	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, err
	}

	return database.Open(filepath.Join(dataDir, "dao.db"))
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

// workspaceRoots is every folder the app should be watching.
func workspaceRoots(db *sql.DB) ([]string, error) {
	rows, err := db.Query(`SELECT root_path FROM workspaces WHERE deleted_at IS NULL`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var roots []string
	for rows.Next() {
		var root string
		if err := rows.Scan(&root); err != nil {
			return nil, err
		}
		if root != "" {
			roots = append(roots, root)
		}
	}

	return roots, rows.Err()
}
