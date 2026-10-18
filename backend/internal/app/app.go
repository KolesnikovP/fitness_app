// Package app wires every module's routes into one HTTP handler. The API
// binary and the integration tests both build the server through NewHandler.
package app

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/KolesnikovP/fitness_app/backend/internal/auth"
	"github.com/KolesnikovP/fitness_app/backend/internal/exercise"
	"github.com/KolesnikovP/fitness_app/backend/internal/platform/httpx"
	"github.com/KolesnikovP/fitness_app/backend/internal/user"
)

func NewHandler(pool *pgxpool.Pool, tokens *auth.Tokens) http.Handler {
	users := user.NewService(pool)
	accounts := auth.NewService(pool, tokens, users)
	exercises := exercise.NewService(pool)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	accounts.Routes(mux)
	users.Routes(mux, accounts)
	exercises.Routes(mux, accounts)
	return mux
}
