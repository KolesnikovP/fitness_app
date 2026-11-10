// Package user owns profiles: the User's name and avatar, and settings such
// as the Unit preference. Their Profile counts come from the workout module
// through Workouts. It identifies the caller through the auth module and never
// reads the accounts table directly.
package user

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/KolesnikovP/fitness_app/backend/internal/auth"
	"github.com/KolesnikovP/fitness_app/backend/internal/platform/httpx"
	"github.com/KolesnikovP/fitness_app/backend/internal/user/store"
	"github.com/KolesnikovP/fitness_app/backend/internal/workout"
)

// Accounts is the part of the auth module this module depends on.
type Accounts interface {
	RequireAuth(next http.Handler) http.Handler
	AccountByID(ctx context.Context, id uuid.UUID) (auth.Account, error)
}

// Workouts is the part of the workout module this module depends on.
type Workouts interface {
	// ProfileCounts works out accountID's Profile counts as of now, with
	// weeks starting on Monday in loc.
	ProfileCounts(ctx context.Context, accountID uuid.UUID, loc *time.Location, now time.Time) (workout.ProfileCounts, error)
}

type Service struct {
	pool    *pgxpool.Pool
	queries *store.Queries
	now     func() time.Time
}

// NewService builds the user module, which reads the current time from now.
func NewService(pool *pgxpool.Pool, now func() time.Time) *Service {
	return &Service{pool: pool, queries: store.New(pool), now: now}
}

// CreateProfile implements auth.ProfileCreator.
func (s *Service) CreateProfile(ctx context.Context, tx pgx.Tx, accountID uuid.UUID) error {
	if err := s.queries.WithTx(tx).CreateProfile(ctx, accountID); err != nil {
		return fmt.Errorf("create profile: %w", err)
	}
	return nil
}

// UnitPreference returns the unit, "kg" or "lb", accountID sees weights in:
// "kg" until they choose during Onboarding. The workout module uses it
// through workout.Profiles.
func (s *Service) UnitPreference(ctx context.Context, accountID uuid.UUID) (string, error) {
	profile, err := s.queries.GetProfile(ctx, accountID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "kg", nil
	}
	if err != nil {
		return "", fmt.Errorf("load profile: %w", err)
	}
	if profile.UnitPreference == nil {
		return "kg", nil
	}
	return *profile.UnitPreference, nil
}

// Me is the caller's account and profile. A null UnitPreference means the
// user has not finished onboarding. Name is the one they chose, or else the
// part of their email before the @. AvatarURL is the API path of their
// avatar, null without one; it changes whenever the avatar does.
type Me struct {
	ID             uuid.UUID `json:"id"`
	Email          string    `json:"email"`
	Name           string    `json:"name"`
	AvatarURL      *string   `json:"avatarUrl"`
	UnitPreference *string   `json:"unitPreference"`
}

// MaxNameChars is the most characters a User's name has.
const MaxNameChars = 50

// Routes takes workouts here rather than in NewService, as the workout
// module is built with this one as its Profiles.
func (s *Service) Routes(mux *http.ServeMux, accounts Accounts, workouts Workouts) {
	h := handlers{pool: s.pool, queries: s.queries, accounts: accounts, workouts: workouts, now: s.now}
	mux.Handle("GET /users/me", accounts.RequireAuth(http.HandlerFunc(h.getMe)))
	mux.Handle("PATCH /users/me", accounts.RequireAuth(http.HandlerFunc(h.patchMe)))
	mux.Handle("PUT /users/me/avatar", accounts.RequireAuth(http.HandlerFunc(h.setAvatar)))
	mux.Handle("DELETE /users/me/avatar", accounts.RequireAuth(http.HandlerFunc(h.removeAvatar)))
	mux.Handle("GET /users/me/avatar", accounts.RequireAuth(http.HandlerFunc(h.serveAvatar)))
	mux.Handle("GET /users/me/counts", accounts.RequireAuth(http.HandlerFunc(h.counts)))
}

type handlers struct {
	pool     *pgxpool.Pool
	queries  *store.Queries
	accounts Accounts
	workouts Workouts
	now      func() time.Time
}

func (h handlers) getMe(w http.ResponseWriter, r *http.Request) {
	id, _ := auth.AccountID(r.Context())
	h.writeMe(w, r, id)
}

// patchMeBody's fields are each optional, but one must be sent. An empty
// Name clears it, so the User is named after their email again.
type patchMeBody struct {
	UnitPreference *string `json:"unitPreference"`
	Name           *string `json:"name"`
}

func (h handlers) patchMe(w http.ResponseWriter, r *http.Request) {
	var body patchMeBody
	if !httpx.DecodeJSON(w, r, &body) {
		return
	}
	if body.Name == nil && body.UnitPreference == nil {
		httpx.WriteError(w, http.StatusBadRequest, "nothing_to_update", `Send "name", "unitPreference" or both.`)
		return
	}
	if body.UnitPreference != nil && *body.UnitPreference != "kg" && *body.UnitPreference != "lb" {
		httpx.WriteError(w, http.StatusBadRequest, "invalid_unit_preference", `unitPreference must be "kg" or "lb".`)
		return
	}
	var name *string
	if body.Name != nil {
		if trimmed := strings.TrimSpace(*body.Name); trimmed != "" {
			name = &trimmed
		}
		if name != nil && utf8.RuneCountInString(*name) > MaxNameChars {
			httpx.WriteError(w, http.StatusBadRequest, "name_too_long", "Names must be 50 characters or fewer.")
			return
		}
	}

	ctx := r.Context()
	id, _ := auth.AccountID(ctx)
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		httpx.WriteInternalError(w, r, fmt.Errorf("begin: %w", err))
		return
	}
	defer tx.Rollback(ctx)
	q := h.queries.WithTx(tx)
	// Each update touches the caller's one profile row, or none if their
	// account is gone.
	var profileRows int64
	if body.UnitPreference != nil {
		if profileRows, err = q.SetUnitPreference(ctx, store.SetUnitPreferenceParams{
			AccountID: id, UnitPreference: body.UnitPreference,
		}); err != nil {
			httpx.WriteInternalError(w, r, fmt.Errorf("set unit preference: %w", err))
			return
		}
	}
	if body.Name != nil {
		if profileRows, err = q.SetName(ctx, store.SetNameParams{AccountID: id, Name: name}); err != nil {
			httpx.WriteInternalError(w, r, fmt.Errorf("set name: %w", err))
			return
		}
	}
	if profileRows == 0 {
		auth.WriteUnauthorized(w)
		return
	}
	if err := tx.Commit(ctx); err != nil {
		httpx.WriteInternalError(w, r, fmt.Errorf("commit: %w", err))
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

	name := strings.Split(account.Email, "@")[0]
	if profile.Name != nil {
		name = *profile.Name
	}
	httpx.WriteJSON(w, http.StatusOK, Me{
		ID:             account.ID,
		Email:          account.Email,
		Name:           name,
		AvatarURL:      avatarURL(profile.AvatarUpdatedAt),
		UnitPreference: profile.UnitPreference,
	})
}

// avatarURL carries the upload time, so a replaced avatar gets a new URL and
// clients don't show a cached copy of the old one.
func avatarURL(updatedAt *time.Time) *string {
	if updatedAt == nil {
		return nil
	}
	url := fmt.Sprintf("/users/me/avatar?v=%d", updatedAt.UnixMilli())
	return &url
}
