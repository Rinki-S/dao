package projects

import (
	"database/sql"
	"encoding/json"
	"errors"
	"io"
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
	mux.HandleFunc("GET /api/projects", h.list)
	mux.HandleFunc("POST /api/projects", h.create)
	mux.HandleFunc("PATCH /api/projects/{id}", h.update)
	mux.HandleFunc("DELETE /api/projects/{id}", h.delete)
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	projects, err := h.repo.List()
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list projects")
		return
	}

	httpx.JSON(w, http.StatusOK, projects)
}

func (h *Handler) update(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		httpx.Error(w, http.StatusBadRequest, "project id is required")
		return
	}

	var req UpdateProjectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Name != nil {
		name := strings.TrimSpace(*req.Name)
		if name == "" {
			httpx.Error(w, http.StatusBadRequest, "project name is required")
			return
		}
		req.Name = &name
	}
	if req.Description != nil {
		description := strings.TrimSpace(*req.Description)
		req.Description = &description
	}
	if req.Name == nil && req.Description == nil {
		httpx.Error(w, http.StatusBadRequest, "project update payload is required")
		return
	}

	project, err := h.repo.Update(id, req)
	if err != nil {
		if err == sql.ErrNoRows {
			httpx.Error(w, http.StatusNotFound, "project not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to update project")
		return
	}

	httpx.JSON(w, http.StatusOK, project)
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		httpx.Error(w, http.StatusBadRequest, "project id is required")
		return
	}

	var req DeleteProjectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil && err != io.EOF {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := h.repo.Delete(id, req); err != nil {
		if err == sql.ErrNoRows {
			httpx.Error(w, http.StatusNotFound, "project not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "failed to delete project")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	var req CreateProjectRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	req.WorkspaceID = strings.TrimSpace(req.WorkspaceID)
	req.Name = strings.TrimSpace(req.Name)
	req.Description = strings.TrimSpace(req.Description)

	if req.WorkspaceID == "" {
		httpx.Error(w, http.StatusBadRequest, "workspaceId is required")
		return
	}

	if req.Name == "" {
		httpx.Error(w, http.StatusBadRequest, "project name is required")
		return
	}

	if req.ParentID != nil {
		parentID := strings.TrimSpace(*req.ParentID)
		if parentID == "" {
			httpx.Error(w, http.StatusBadRequest, "project parentId is invalid")
			return
		}
		req.ParentID = &parentID
	}

	project, err := h.repo.Create(req)
	if err != nil {
		if errors.Is(err, ErrParentNotFound) {
			httpx.Error(w, http.StatusBadRequest, "project parentId is invalid")
			return
		}

		httpx.Error(w, http.StatusInternalServerError, "failed to create project")
		return
	}

	httpx.JSON(w, http.StatusCreated, project)
}
