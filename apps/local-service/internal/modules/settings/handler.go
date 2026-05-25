package settings

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
	mux.HandleFunc("GET /api/settings/working-directory", h.getWorkingDirectory)
	mux.HandleFunc("PUT /api/settings/working-directory", h.updateWorkingDirectory)
}

func (h *Handler) getWorkingDirectory(w http.ResponseWriter, r *http.Request) {
	path, configured, err := h.repo.GetWorkingDirectory()
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to get working directory")
		return
	}

	httpx.JSON(w, http.StatusOK, WorkingDirectoryResponse{
		Path:       path,
		Configured: configured,
	})
}

func (h *Handler) updateWorkingDirectory(w http.ResponseWriter, r *http.Request) {
	var req UpdateWorkingDirectoryRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	path, err := h.repo.SetWorkingDirectory(strings.TrimSpace(req.Path))
	if err != nil {
		if errors.Is(err, ErrWorkingDirectoryNotConfigured) {
			httpx.Error(w, http.StatusBadRequest, "working directory path is required")
			return
		}

		httpx.Error(w, http.StatusInternalServerError, "failed to update working directory")
		return
	}

	httpx.JSON(w, http.StatusOK, WorkingDirectoryResponse{
		Path:       path,
		Configured: true,
	})
}
