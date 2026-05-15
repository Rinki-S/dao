package workspaces

import (
	"encoding/json"
	"net/http"
	"strings"
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
		writeError(w, http.StatusInternalServerError, "Failed to list workspaces")
		return
	}

	writeJSON(w, http.StatusOK, workspaces)
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	var req CreateWorkspaceRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	req.Name = strings.TrimSpace(req.Name)

	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "workspace name is required")
		return
	}

	workspace, err := h.repo.Create(req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create workspace")
		return
	}

	writeJSON(w, http.StatusCreated, workspace)
}

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)

	json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
