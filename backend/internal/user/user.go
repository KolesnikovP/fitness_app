// Package user owns profiles: user-facing settings such as the unit
// preference. It identifies the caller through the auth module and never
// reads the accounts table directly.
package user

import (
	"context"
	"errors"
	"fmt"
	"net/http"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/KolesnikovP/fitness_app/backend/internal/auth"
	"github.com/KolesnikovP/fitness_app/backend/internal/platform/httpx"
	"github.com/KolesnikovP/fitness_app/backend/internal/user/store"
)

// Accounts is the part of the auth module this module depends on.
type Accounts interface {
	RequireAuth(next http.Handler) http.Handler
	AccountByID(ctx context.Context, id uuid.UUID) (auth.Account, error)
}

type Service struct {
	queries *store.Queries
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{queries: store.New(pool)}
}

// CreateProfile implements auth.ProfileCreator.
func (s *Service) CreateProfile(ctx context.Context, tx pgx.Tx, accountID uuid.UUID) error {
	if err := s.queries.WithTx(tx).CreateProfile(ctx, accountID); err != nil {
		return fmt.Errorf("create profile: %w", err)
	}
	return nil
}

// Me is the caller's account and profile. A null UnitPreference means the
// user has not finished onboarding.
type Me struct {
	ID             uuid.UUID `json:"id"`
	Email          string    `json:"email"`
	UnitPreference *string   `json:"unitPreference"`
}

func (s *Service) Routes(mux *http.ServeMux, accounts Accounts) {
	h := handlers{queries: s.queries, accounts: accounts}
	mux.Handle("GET /users/me", accounts.RequireAuth(http.HandlerFunc(h.getMe)))
	mux.Handle("PATCH /users/me", accounts.RequireAuth(http.HandlerFunc(h.patchMe)))
}

type handlers struct {
	queries  *store.Queries
	accounts Accounts
}

func (h handlers) getMe(w http.ResponseWriter, r *http.Request) {
	id, _ := auth.AccountID(r.Context())
	h.writeMe(w, r, id)
}

type patchMeBody struct {
	UnitPreference *string `json:"unitPreference"`
}

func (h handlers) patchMe(w http.ResponseWriter, r *http.Request) {
	var body patchMeBody
	if !httpx.DecodeJSON(w, r, &body) {
		return
	}
	if body.UnitPreference == nil || (*body.UnitPreference != "kg" && *body.UnitPreference != "lb") {
		httpx.WriteError(w, http.StatusBadRequest, "invalid_unit_preference", `unitPreference must be "kg" or "lb".`)
		return
	}

	id, _ := auth.AccountID(r.Context())
	_, err := h.queries.SetUnitPreference(r.Context(), store.SetUnitPreferenceParams{
		AccountID:      id,
		UnitPreference: body.UnitPreference,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		auth.WriteUnauthorized(w)
		return
	}
	if err != nil {
		httpx.WriteInternalError(w, r, err)
		return
	}
	h.writeMe(w, r, id)
}

func (h handlers) writeMe(w http.ResponseWriter, r *http.Request, id uuid.UUID) {
	account, err := h.accounts.AccountByID(r.Context(), id)
	if errors.Is(err, auth.ErrAccountNotFound) {
		// The token is valid but its account is gone.
		auth.WriteUnauthorized(w)
		return
	}
	if err != nil {
		httpx.WriteInternalError(w, r, err)
		return
	}

	profile, err := h.queries.GetProfile(r.Context(), id)
	if err != nil {
		httpx.WriteInternalError(w, r, fmt.Errorf("load profile: %w", err))
		return
	}

	httpx.WriteJSON(w, http.StatusOK, Me{
		ID:             account.ID,
		Email:          account.Email,
		UnitPreference: profile.UnitPreference,
	})
}
