package auth

import (
	"context"
	"net/http"
	"strings"

	"github.com/google/uuid"

	"github.com/KolesnikovP/fitness_app/backend/internal/platform/httpx"
)

type contextKey struct{}

// RequireAuth rejects requests without a valid "Authorization: Bearer" token
// and stores the caller's account ID in the request context.
//
// It only checks the token, not that the account still exists; handlers that
// load the account should treat a missing one as unauthorised.
func (s *Service) RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		if !ok || token == "" {
			WriteUnauthorized(w)
			return
		}

		id, err := s.tokens.Verify(token)
		if err != nil {
			WriteUnauthorized(w)
			return
		}

		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), contextKey{}, id)))
	})
}

// AccountID returns the caller's account ID set by RequireAuth.
func AccountID(ctx context.Context) (uuid.UUID, bool) {
	id, ok := ctx.Value(contextKey{}).(uuid.UUID)
	return id, ok
}

// WriteUnauthorized writes the standard 401 response.
func WriteUnauthorized(w http.ResponseWriter) {
	httpx.WriteError(w, http.StatusUnauthorized, "unauthorized", "Log in to continue.")
}
