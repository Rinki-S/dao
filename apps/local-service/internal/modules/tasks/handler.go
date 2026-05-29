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

var allowedStatusUpdates = map[string]struct{}{
	"todo": {},
	"done": {},
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
	mux.HandleFunc("PATCH /api/tasks/{id}", h.update)
	mux.HandleFunc("DELETE /api/tasks/{id}", h.delete)
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
	req.ParentID = trimOptionalString(req.ParentID)
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
		if errors.Is(err, ErrInvalidParentTask) {
			httpx.Error(w, http.StatusBadRequest, "parent task is invalid")
			return
		}

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
	if _, ok := allowedStatusUpdates[req.Status]; !ok {
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

func (h *Handler) update(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		httpx.Error(w, http.StatusBadRequest, "task id is required")
		return
	}

	var raw map[string]*json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	req := UpdateTaskRequest{}

	if value, ok := raw["projectId"]; ok {
		req.ProjectIDSet = true
		if value != nil && string(*value) != "null" {
			var projectID string
			if err := json.Unmarshal(*value, &projectID); err != nil {
				httpx.Error(w, http.StatusBadRequest, "task projectId is invalid")
				return
			}
			req.ProjectID = trimOptionalString(&projectID)
		}
	}

	if value, ok := raw["title"]; ok {
		if value == nil || string(*value) == "null" {
			httpx.Error(w, http.StatusBadRequest, "task title is required")
			return
		}
		var title string
		if err := json.Unmarshal(*value, &title); err != nil {
			httpx.Error(w, http.StatusBadRequest, "task title is invalid")
			return
		}
		title = strings.TrimSpace(title)
		if title == "" {
			httpx.Error(w, http.StatusBadRequest, "task title is required")
			return
		}
		req.Title = &title
	}

	if value, ok := raw["description"]; ok {
		if value == nil || string(*value) == "null" {
			description := ""
			req.Description = &description
		} else {
			var description string
			if err := json.Unmarshal(*value, &description); err != nil {
				httpx.Error(w, http.StatusBadRequest, "task description is invalid")
				return
			}
			description = strings.TrimSpace(description)
			req.Description = &description
		}
	}

	if value, ok := raw["priority"]; ok {
		if value == nil || string(*value) == "null" {
			httpx.Error(w, http.StatusBadRequest, "task priority is invalid")
			return
		}
		var priority string
		if err := json.Unmarshal(*value, &priority); err != nil {
			httpx.Error(w, http.StatusBadRequest, "task priority is invalid")
			return
		}
		priority = strings.TrimSpace(priority)
		if _, ok := allowedPriorities[priority]; !ok {
			httpx.Error(w, http.StatusBadRequest, "task priority is invalid")
			return
		}
		req.Priority = &priority
	}

	if value, ok := raw["dueDate"]; ok {
		req.DueDateSet = true
		if value != nil && string(*value) != "null" {
			var dueDate string
			if err := json.Unmarshal(*value, &dueDate); err != nil {
				httpx.Error(w, http.StatusBadRequest, "task dueDate is invalid")
				return
			}
			req.DueDate = trimOptionalString(&dueDate)
		}
	}

	if req.Title == nil && req.Description == nil && req.Priority == nil && !req.ProjectIDSet && !req.DueDateSet {
		httpx.Error(w, http.StatusBadRequest, "task update payload is required")
		return
	}

	task, err := h.repo.Update(id, req)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "task not found")
			return
		}

		httpx.Error(w, http.StatusInternalServerError, "failed to update task")
		return
	}

	httpx.JSON(w, http.StatusOK, task)
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	if id == "" {
		httpx.Error(w, http.StatusBadRequest, "task id is required")
		return
	}

	if err := h.repo.Delete(id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpx.Error(w, http.StatusNotFound, "task not found")
			return
		}

		httpx.Error(w, http.StatusInternalServerError, "failed to delete task")
		return
	}

	w.WriteHeader(http.StatusNoContent)
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
