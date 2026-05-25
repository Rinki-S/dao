package tasks

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/rinki-s/dao/apps/local-service/internal/httpx"
)

var allowedPriorities = map[string]struct{}{
	"low":    {},
	"medium": {},
	"high":   {},
}

var allowedStatuses = map[string]struct{}{
	"todo":     {},
	"doing":    {},
	"done":     {},
	"archived": {},
}

type Handler struct {
	repo *Repository
}

func NewHandler(repo *Repository) *Handler {
	return &Handler{repo: repo}
}

func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/tasks", h.list)
	mux.HandleFunc("POST /api/tasks", h.create)
	mux.HandleFunc("PATCH /api/tasks/{id}/status", h.updateStatus)
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	tasks, err := h.repo.List()
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list tasks")
		return
	}

	httpx.JSON(w, http.StatusOK, tasks)
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	var req CreateTaskRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	req.WorkspaceID = strings.TrimSpace(req.WorkspaceID)
	req.Title = strings.TrimSpace(req.Title)
	req.Description = strings.TrimSpace(req.Description)
	req.Priority = strings.TrimSpace(req.Priority)
	req.ProjectID = trimOptionalString(req.ProjectID)
	req.DueDate = trimOptionalString(req.DueDate)

	if req.WorkspaceID == "" {
		httpx.Error(w, http.StatusBadRequest, "workspaceId is required")
		return
	}

	if req.Title == "" {
		httpx.Error(w, http.StatusBadRequest, "task title is required")
		return
	}

	if req.Priority != "" {
		if _, ok := allowedPriorities[req.Priority]; !ok {
			httpx.Error(w, http.StatusBadRequest, "task priority is invalid")
			return
		}
	}

	task, err := h.repo.Create(req)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to create task")
		return
	}

	httpx.JSON(w, http.StatusCreated, task)
}

func (h *Handler) updateStatus(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		httpx.Error(w, http.StatusBadRequest, "task id is required")
		return
	}

	var req UpdateTaskStatusRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	req.Status = strings.TrimSpace(req.Status)
	if _, ok := allowedStatuses[req.Status]; !ok {
		httpx.Error(w, http.StatusBadRequest, "task status is invalid")
		return
	}

	task, err := h.repo.UpdateStatus(id, req)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "task not found")
			return
		}

		httpx.Error(w, http.StatusInternalServerError, "failed to update task status")
		return
	}

	httpx.JSON(w, http.StatusOK, task)
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
