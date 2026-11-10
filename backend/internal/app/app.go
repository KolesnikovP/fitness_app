// Package app wires every module's routes into one HTTP handler. The API
// binary and the integration tests both build the server through NewHandler.
package app

import (
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/KolesnikovP/fitness_app/backend/internal/auth"
	"github.com/KolesnikovP/fitness_app/backend/internal/exercise"
	"github.com/KolesnikovP/fitness_app/backend/internal/feed"
	"github.com/KolesnikovP/fitness_app/backend/internal/platform/httpx"
	"github.com/KolesnikovP/fitness_app/backend/internal/program"
	"github.com/KolesnikovP/fitness_app/backend/internal/user"
	"github.com/KolesnikovP/fitness_app/backend/internal/workout"
)

// NewHandler builds the API, which reads the current time from now: time.Now
// in production, a fixed instant in tests. Tokens keep the real time.
func NewHandler(pool *pgxpool.Pool, tokens *auth.Tokens, now func() time.Time) http.Handler {
	users := user.NewService(pool, now)
	accounts := auth.NewService(pool, tokens, users)
	exercises := exercise.NewService(pool)
	programs := program.NewService(pool, exercises)
	workouts := workout.NewService(pool, exercises, programs, users)
	posts := feed.NewService(pool, workouts)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	accounts.Routes(mux)
	users.Routes(mux, accounts, workouts)
	exercises.Routes(mux, accounts)
	programs.Routes(mux, accounts)
	workouts.Routes(mux, accounts)
	posts.Routes(mux, accounts)
	return mux
}
