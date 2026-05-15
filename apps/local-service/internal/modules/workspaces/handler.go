package workspaces

import (
	"encoding/json"
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
	mux.HandleFunc("GET /api/workspaces", h.list)
	mux.HandleFunc("POST /api/workspaces", h.create)
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	workspaces, err := h.repo.List()
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "Failed to list workspaces")
		return
	}

	httpx.JSON(w, http.StatusOK, workspaces)
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	var req CreateWorkspaceRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	req.Name = strings.TrimSpace(req.Name)

	if req.Name == "" {
		httpx.Error(w, http.StatusBadRequest, "workspace name is required")
		return
	}

	workspace, err := h.repo.Create(req)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create workspace")
		return
	}

	httpx.JSON(w, http.StatusCreated, workspace)
}
