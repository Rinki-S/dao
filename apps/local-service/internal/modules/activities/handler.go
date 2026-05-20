package activities

import (
	"net/http"

	"github.com/rinki-s/dao/apps/local-service/internal/httpx"
)

type Handler struct {
	repo *Repository
}

func NewHandler(repo *Repository) *Handler {
	return &Handler{repo: repo}
}

func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/activities", h.list)
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	activities, err := h.repo.List()
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list activities")
		return
	}

	httpx.JSON(w, http.StatusOK, activities)
}
