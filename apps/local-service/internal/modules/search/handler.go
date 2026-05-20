package search

import (
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
	mux.HandleFunc("GET /api/search", h.search)
}

func (h *Handler) search(w http.ResponseWriter, r *http.Request) {
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if query == "" {
		httpx.JSON(w, http.StatusOK, []Result{})
		return
	}

	results, err := h.repo.Search(query)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to search")
		return
	}

	httpx.JSON(w, http.StatusOK, results)
}
