package notes

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/rinki-s/dao/apps/local-service/internal/httpx"
)

var allowedContentTypes = map[string]struct{}{
	"markdown": {},
}

var allowedNoteTypes = map[string]struct{}{
	"general":   {},
	"project":   {},
	"learning":  {},
	"daily":     {},
	"interview": {},
}

type Handler struct {
	repo *Repository
}

func NewHandler(repo *Repository) *Handler {
	return &Handler{repo: repo}
}

func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/notes", h.list)
	mux.HandleFunc("POST /api/notes", h.create)
	mux.HandleFunc("GET /api/notes/{id}", h.get)
	mux.HandleFunc("PUT /api/notes/{id}/content", h.updateContent)
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	notes, err := h.repo.List()
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list notes")
		return
	}

	httpx.JSON(w, http.StatusOK, notes)
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		httpx.Error(w, http.StatusBadRequest, "note id is required")
		return
	}

	note, err := h.repo.Get(id)
	if err != nil {
		if err == sql.ErrNoRows {
			httpx.Error(w, http.StatusNotFound, "note not found")
			return
		}

		httpx.Error(w, http.StatusInternalServerError, "failed to get note")
		return
	}

	httpx.JSON(w, http.StatusOK, note)
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	var req CreateNoteRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	req.WorkspaceID = strings.TrimSpace(req.WorkspaceID)
	req.Title = strings.TrimSpace(req.Title)
	req.ContentType = strings.TrimSpace(req.ContentType)
	req.NoteType = strings.TrimSpace(req.NoteType)
	req.ProjectID = trimOptionalString(req.ProjectID)

	if req.WorkspaceID == "" {
		httpx.Error(w, http.StatusBadRequest, "workspaceId is required")
		return
	}

	if req.Title == "" {
		httpx.Error(w, http.StatusBadRequest, "note title is required")
		return
	}

	if req.ContentType != "" {
		if _, ok := allowedContentTypes[req.ContentType]; !ok {
			httpx.Error(w, http.StatusBadRequest, "note contentType is invalid")
			return
		}
	}

	if req.NoteType != "" {
		if _, ok := allowedNoteTypes[req.NoteType]; !ok {
			httpx.Error(w, http.StatusBadRequest, "note noteType is invalid")
			return
		}
	}

	note, err := h.repo.Create(req)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create note")
		return
	}

	httpx.JSON(w, http.StatusCreated, note)
}

func (h *Handler) updateContent(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		httpx.Error(w, http.StatusBadRequest, "note id is required")
		return
	}

	var req UpdateNoteContentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	note, err := h.repo.UpdateContent(id, req.Content)
	if err != nil {
		if err == sql.ErrNoRows {
			httpx.Error(w, http.StatusNotFound, "note not found")
			return
		}

		httpx.Error(w, http.StatusInternalServerError, "failed to update note content")
		return
	}

	httpx.JSON(w, http.StatusOK, note)
}

func trimOptionalString(value *string) *string {
	if value == nil {
		return nil
	}

	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}

	return &trimmed
}
