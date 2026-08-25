package tasks

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/rinki-s/dao/apps/local-service/internal/httpx"
)

type Handler struct {
	repo *Repository
}

func NewHandler(repo *Repository) *Handler {
	return &Handler{repo: repo}
}

func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/tasks", h.get)
	mux.HandleFunc("PUT /api/tasks", h.update)
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	workspaceID := strings.TrimSpace(r.URL.Query().Get("workspaceId"))
	if workspaceID == "" {
		httpx.Error(w, http.StatusBadRequest, "workspaceId is required")
		return
	}

	document, err := h.repo.Get(workspaceID)
	if err != nil {
		if errors.Is(err, ErrWorkspaceNotFound) {
			httpx.Error(w, http.StatusNotFound, "workspace not found")
			return
		}

		httpx.Error(w, http.StatusInternalServerError, "failed to read tasks")
		return
	}

	httpx.JSON(w, http.StatusOK, document)
}

func (h *Handler) update(w http.ResponseWriter, r *http.Request) {
	workspaceID := strings.TrimSpace(r.URL.Query().Get("workspaceId"))
	if workspaceID == "" {
		httpx.Error(w, http.StatusBadRequest, "workspaceId is required")
		return
	}

	var req UpdateDocumentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	document, err := h.repo.Update(workspaceID, req.Content)
	if err != nil {
		if errors.Is(err, ErrWorkspaceNotFound) {
			httpx.Error(w, http.StatusNotFound, "workspace not found")
			return
		}

		httpx.Error(w, http.StatusInternalServerError, "failed to save tasks")
		return
	}

	httpx.JSON(w, http.StatusOK, document)
}
