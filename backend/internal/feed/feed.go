// Package feed owns Posts: a finished Session as the User shows it, with an
// optional caption and Progress photo. A Post shares its Session's id and
// exists from the moment the Session is finished (ADR 0008). Its Session, with
// the stats and Personal records as they are now (ADR 0007), comes from the
// workout module through Sessions; this module never reads its tables.
// Nobody but the owner sees a Post until the feed exists.
package feed

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/KolesnikovP/fitness_app/backend/internal/auth"
	"github.com/KolesnikovP/fitness_app/backend/internal/feed/store"
	"github.com/KolesnikovP/fitness_app/backend/internal/platform/httpx"
	"github.com/KolesnikovP/fitness_app/backend/internal/workout"
)

// Accounts is the part of the auth module this module depends on.
type Accounts interface {
	RequireAuth(next http.Handler) http.Handler
}

// Sessions is the part of the workout module this module depends on.
type Sessions interface {
	// FinishedSession returns callerID's finished Session id, or
	// workout.ErrSessionNotFound if callerID has no such finished Session.
	FinishedSession(ctx context.Context, callerID, id uuid.UUID) (workout.Session, error)
}

type Service struct {
	pool     *pgxpool.Pool
	queries  *store.Queries
	sessions Sessions
}

func NewService(pool *pgxpool.Pool, sessions Sessions) *Service {
	return &Service{pool: pool, queries: store.New(pool), sessions: sessions}
}

// Post is a finished Session as the User shows it. Its ID is the Session's.
// Caption is empty when unset. PhotoURL is the API path of its Progress
// photo, null when it has none; it changes whenever the photo does.
type Post struct {
	ID       uuid.UUID       `json:"id"`
	Caption  string          `json:"caption"`
	PhotoURL *string         `json:"photoUrl"`
	Session  workout.Session `json:"session"`
}

func (s *Service) Routes(mux *http.ServeMux, accounts Accounts) {
	h := handlers{pool: s.pool, queries: s.queries, sessions: s.sessions}
	mux.Handle("GET /posts/{id}", accounts.RequireAuth(http.HandlerFunc(h.get)))
	mux.Handle("PATCH /posts/{id}", accounts.RequireAuth(http.HandlerFunc(h.update)))
	mux.Handle("PUT /posts/{id}/photo", accounts.RequireAuth(http.HandlerFunc(h.setPhoto)))
	mux.Handle("DELETE /posts/{id}/photo", accounts.RequireAuth(http.HandlerFunc(h.removePhoto)))
	mux.Handle("GET /posts/{id}/photo", accounts.RequireAuth(http.HandlerFunc(h.servePhoto)))
}

type handlers struct {
	pool     *pgxpool.Pool
	queries  *store.Queries
	sessions Sessions
}

// get returns one of the caller's Posts.
func (h handlers) get(w http.ResponseWriter, r *http.Request) {
	session, ok := h.loadSession(w, r)
	if !ok {
		return
	}
	h.writePost(w, r, session)
}

// maxCaptionChars is Instagram's caption limit, so a caption always fits.
const maxCaptionChars = 2200

// updateBody's Caption is required: a body without one is refused, rather
// than read as clearing the caption.
type updateBody struct {
	Caption *string `json:"caption"`
}

// update sets the caption of one of the caller's Posts; an empty caption
// clears it.
func (h handlers) update(w http.ResponseWriter, r *http.Request) {
	var body updateBody
	if !httpx.DecodeJSON(w, r, &body) {
		return
	}
	if body.Caption == nil {
		httpx.WriteError(w, http.StatusBadRequest, "missing_caption", `Send the caption as "caption"; an empty one clears it.`)
		return
	}
	caption := *body.Caption
	if utf8.RuneCountInString(caption) > maxCaptionChars {
		httpx.WriteError(w, http.StatusBadRequest, "caption_too_long", "Captions must be 2,200 characters or fewer.")
		return
	}
	session, ok := h.loadSession(w, r)
	if !ok {
		return
	}
	caller, _ := auth.AccountID(r.Context())
	if err := h.queries.UpsertCaption(r.Context(), store.UpsertCaptionParams{
		SessionID: session.ID, AccountID: caller, Caption: caption,
	}); err != nil {
		httpx.WriteInternalError(w, r, fmt.Errorf("save caption: %w", err))
		return
	}
	h.writePost(w, r, session)
}

// loadSession loads the caller's finished Session {id}, the one the Post is
// of. It writes a 404 if there's no such Post and returns false.
func (h handlers) loadSession(w http.ResponseWriter, r *http.Request) (workout.Session, bool) {
	ctx := r.Context()
	caller, _ := auth.AccountID(ctx)
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writePostNotFound(w)
		return workout.Session{}, false
	}
	session, err := h.sessions.FinishedSession(ctx, caller, id)
	if errors.Is(err, workout.ErrSessionNotFound) {
		writePostNotFound(w)
		return workout.Session{}, false
	}
	if err != nil {
		httpx.WriteInternalError(w, r, err)
		return workout.Session{}, false
	}
	return session, true
}

// writePost writes the Post of session.
func (h handlers) writePost(w http.ResponseWriter, r *http.Request, session workout.Session) {
	post := Post{ID: session.ID, Session: session}
	row, err := h.queries.GetPost(r.Context(), session.ID)
	switch {
	case errors.Is(err, pgx.ErrNoRows):
	case err != nil:
		httpx.WriteInternalError(w, r, fmt.Errorf("load post: %w", err))
		return
	default:
		post.Caption = row.Caption
		post.PhotoURL = photoURL(session.ID, row.PhotoUpdatedAt)
	}
	httpx.WriteJSON(w, http.StatusOK, post)
}

// photoURL carries the upload time, so a replaced photo gets a new URL and
// clients don't show a cached copy of the old one.
func photoURL(id uuid.UUID, updatedAt *time.Time) *string {
	if updatedAt == nil {
		return nil
	}
	url := fmt.Sprintf("/posts/%s/photo?v=%d", id, updatedAt.UnixMilli())
	return &url
}

func writePostNotFound(w http.ResponseWriter) {
	httpx.WriteError(w, http.StatusNotFound, "post_not_found", "Post not found.")
}
