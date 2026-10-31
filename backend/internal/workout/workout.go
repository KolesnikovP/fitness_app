// Package workout owns Sessions: the workouts a User logs, the Exercises
// added to each, and the Sets logged for them. Exercise names come from the
// exercise module through Exercises; this module never reads its tables.
package workout

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/KolesnikovP/fitness_app/backend/internal/auth"
	"github.com/KolesnikovP/fitness_app/backend/internal/platform/httpx"
	"github.com/KolesnikovP/fitness_app/backend/internal/workout/store"
)

// Accounts is the part of the auth module this module depends on.
type Accounts interface {
	RequireAuth(next http.Handler) http.Handler
}

// Exercises is the part of the exercise module this module depends on.
type Exercises interface {
	// ExerciseNames returns the names of the given exercises that callerID
	// may see, keyed by id, leaving out any the caller can't see.
	ExerciseNames(ctx context.Context, callerID uuid.UUID, ids []uuid.UUID) (map[uuid.UUID]string, error)
}

type Service struct {
	pool      *pgxpool.Pool
	queries   *store.Queries
	exercises Exercises
}

func NewService(pool *pgxpool.Pool, exercises Exercises) *Service {
	return &Service{pool: pool, queries: store.New(pool), exercises: exercises}
}

// Session is one logged workout as the API returns it. FinishedAt is null
// while the Session is in progress.
type Session struct {
	ID         uuid.UUID         `json:"id"`
	StartedAt  time.Time         `json:"startedAt"`
	FinishedAt *time.Time        `json:"finishedAt"`
	Exercises  []SessionExercise `json:"exercises"`
}

// SessionExercise is an Exercise added to a Session, with its Sets in the
// order they were logged.
type SessionExercise struct {
	ID         uuid.UUID `json:"id"`
	ExerciseID uuid.UUID `json:"exerciseId"`
	Name       string    `json:"name"`
	Note       string    `json:"note"`
	Sets       []Set     `json:"sets"`
}

// Set is one logged Set. Weight is in WeightUnit, the unit it was logged in.
type Set struct {
	ID         uuid.UUID `json:"id"`
	Weight     float64   `json:"weight"`
	WeightUnit string    `json:"weightUnit"`
	Reps       int32     `json:"reps"`
	Note       string    `json:"note"`
}

// SessionSummary is a finished Session as the history list shows it.
type SessionSummary struct {
	ID            uuid.UUID `json:"id"`
	StartedAt     time.Time `json:"startedAt"`
	FinishedAt    time.Time `json:"finishedAt"`
	ExerciseNames []string  `json:"exerciseNames"`
}

func (s *Service) Routes(mux *http.ServeMux, accounts Accounts) {
	h := handlers{pool: s.pool, queries: s.queries, exercises: s.exercises}
	mux.Handle("POST /workouts/sessions", accounts.RequireAuth(http.HandlerFunc(h.start)))
	mux.Handle("GET /workouts/sessions", accounts.RequireAuth(http.HandlerFunc(h.history)))
	mux.Handle("GET /workouts/sessions/current", accounts.RequireAuth(http.HandlerFunc(h.current)))
	mux.Handle("POST /workouts/sessions/{id}/exercises", accounts.RequireAuth(http.HandlerFunc(h.addExercise)))
	mux.Handle("PATCH /workouts/sessions/{id}/exercises/{sessionExerciseId}", accounts.RequireAuth(http.HandlerFunc(h.setExerciseNote)))
	mux.Handle("POST /workouts/sessions/{id}/exercises/{sessionExerciseId}/sets", accounts.RequireAuth(http.HandlerFunc(h.logSet)))
	mux.Handle("POST /workouts/sessions/{id}/finish", accounts.RequireAuth(http.HandlerFunc(h.finish)))
	mux.Handle("DELETE /workouts/sessions/{id}", accounts.RequireAuth(http.HandlerFunc(h.discard)))
}

type handlers struct {
	pool      *pgxpool.Pool
	queries   *store.Queries
	exercises Exercises
}

func (h handlers) start(w http.ResponseWriter, r *http.Request) {
	caller, _ := auth.AccountID(r.Context())
	id, err := h.queries.StartSession(r.Context(), caller)
	switch {
	case isViolation(err, "23505"):
		httpx.WriteError(w, http.StatusConflict, "session_in_progress",
			"Finish or discard your current workout before starting another.")
		return
	case isViolation(err, "23503"):
		// The token is valid but its account is gone.
		auth.WriteUnauthorized(w)
		return
	case err != nil:
		httpx.WriteInternalError(w, r, fmt.Errorf("start session: %w", err))
		return
	}
	h.writeSession(w, r, http.StatusCreated, id)
}

type historyResponse struct {
	Sessions []SessionSummary `json:"sessions"`
}

// history lists the caller's finished sessions, newest first.
func (h handlers) history(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	caller, _ := auth.AccountID(ctx)
	rows, err := h.queries.ListFinishedSessions(ctx, caller)
	if err != nil {
		httpx.WriteInternalError(w, r, fmt.Errorf("list finished sessions: %w", err))
		return
	}
	sessionIDs := make([]uuid.UUID, len(rows))
	for i, row := range rows {
		sessionIDs[i] = row.ID
	}
	exerciseRows, err := h.queries.ListExercisesOfSessions(ctx, sessionIDs)
	if err != nil {
		httpx.WriteInternalError(w, r, fmt.Errorf("list exercises of sessions: %w", err))
		return
	}
	exerciseIDs := make([]uuid.UUID, len(exerciseRows))
	for i, e := range exerciseRows {
		exerciseIDs[i] = e.ExerciseID
	}
	names, err := h.exercises.ExerciseNames(ctx, caller, exerciseIDs)
	if err != nil {
		httpx.WriteInternalError(w, r, err)
		return
	}
	// Each exercise once, in the order it was first added.
	namesBySession := make(map[uuid.UUID][]string)
	for _, e := range exerciseRows {
		if !slices.Contains(namesBySession[e.SessionID], names[e.ExerciseID]) {
			namesBySession[e.SessionID] = append(namesBySession[e.SessionID], names[e.ExerciseID])
		}
	}

	out := make([]SessionSummary, len(rows))
	for i, row := range rows {
		out[i] = SessionSummary{
			ID:            row.ID,
			StartedAt:     row.StartedAt,
			FinishedAt:    *row.FinishedAt,
			ExerciseNames: append([]string{}, namesBySession[row.ID]...),
		}
	}
	httpx.WriteJSON(w, http.StatusOK, historyResponse{Sessions: out})
}

type currentResponse struct {
	Session *Session `json:"session"`
}

// current returns the caller's session in progress, or null, so the client
// can resume it after a restart.
func (h handlers) current(w http.ResponseWriter, r *http.Request) {
	caller, _ := auth.AccountID(r.Context())
	id, err := h.queries.GetSessionInProgress(r.Context(), caller)
	if errors.Is(err, pgx.ErrNoRows) {
		httpx.WriteJSON(w, http.StatusOK, currentResponse{})
		return
	}
	if err != nil {
		httpx.WriteInternalError(w, r, fmt.Errorf("find session in progress: %w", err))
		return
	}
	session, err := h.loadSession(r.Context(), id)
	if err != nil {
		httpx.WriteInternalError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, currentResponse{Session: &session})
}

type addExerciseBody struct {
	ExerciseID string `json:"exerciseId"`
}

func (h handlers) addExercise(w http.ResponseWriter, r *http.Request) {
	var body addExerciseBody
	if !httpx.DecodeJSON(w, r, &body) {
		return
	}
	caller, _ := auth.AccountID(r.Context())
	exerciseID, err := uuid.Parse(body.ExerciseID)
	if err != nil {
		writeExerciseNotFound(w)
		return
	}
	names, err := h.exercises.ExerciseNames(r.Context(), caller, []uuid.UUID{exerciseID})
	if err != nil {
		httpx.WriteInternalError(w, r, err)
		return
	}
	if _, ok := names[exerciseID]; !ok {
		writeExerciseNotFound(w)
		return
	}

	h.changeSession(w, r, http.StatusCreated, func(q *store.Queries, sessionID uuid.UUID) error {
		return q.AddSessionExercise(r.Context(), store.AddSessionExerciseParams{SessionID: sessionID, ExerciseID: exerciseID})
	})
}

type setExerciseNoteBody struct {
	Note *string `json:"note"`
}

func (h handlers) setExerciseNote(w http.ResponseWriter, r *http.Request) {
	var body setExerciseNoteBody
	if !httpx.DecodeJSON(w, r, &body) {
		return
	}
	if body.Note == nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid_note", "Send the note, or an empty one to clear it.")
		return
	}
	note, ok := validNote(w, *body.Note)
	if !ok {
		return
	}
	sessionExerciseID, err := uuid.Parse(r.PathValue("sessionExerciseId"))
	if err != nil {
		writeSessionExerciseNotFound(w)
		return
	}

	h.changeSession(w, r, http.StatusOK, func(q *store.Queries, sessionID uuid.UUID) error {
		updated, err := q.SetSessionExerciseNote(r.Context(), store.SetSessionExerciseNoteParams{
			ID: sessionExerciseID, SessionID: sessionID, Note: note,
		})
		if err != nil {
			return fmt.Errorf("set exercise note: %w", err)
		}
		if updated == 0 {
			writeSessionExerciseNotFound(w)
			return errResponseWritten
		}
		return nil
	})
}

type logSetBody struct {
	Weight     *float64 `json:"weight"`
	WeightUnit string   `json:"weightUnit"`
	Reps       *int     `json:"reps"`
	Note       string   `json:"note"`
}

// Limits matching the session_sets CHECK constraints.
const (
	maxWeight     = 9999.99
	maxReps       = 1000
	maxNoteLength = 500
)

func (h handlers) logSet(w http.ResponseWriter, r *http.Request) {
	var body logSetBody
	if !httpx.DecodeJSON(w, r, &body) {
		return
	}
	if body.Weight == nil || *body.Weight < 0 || *body.Weight > maxWeight {
		httpx.WriteError(w, http.StatusBadRequest, "invalid_weight",
			fmt.Sprintf("Weight must be from 0 to %g.", maxWeight))
		return
	}
	if body.WeightUnit != "kg" && body.WeightUnit != "lb" {
		httpx.WriteError(w, http.StatusBadRequest, "invalid_weight_unit", `weightUnit must be "kg" or "lb".`)
		return
	}
	if body.Reps == nil || *body.Reps < 1 || *body.Reps > maxReps {
		httpx.WriteError(w, http.StatusBadRequest, "invalid_reps", fmt.Sprintf("Reps must be from 1 to %d.", maxReps))
		return
	}
	note, ok := validNote(w, body.Note)
	if !ok {
		return
	}
	sessionExerciseID, err := uuid.Parse(r.PathValue("sessionExerciseId"))
	if err != nil {
		writeSessionExerciseNotFound(w)
		return
	}

	h.changeSession(w, r, http.StatusCreated, func(q *store.Queries, sessionID uuid.UUID) error {
		logged, err := q.LogSet(r.Context(), store.LogSetParams{
			Weight:            *body.Weight,
			WeightUnit:        body.WeightUnit,
			Reps:              int32(*body.Reps),
			Note:              note,
			SessionExerciseID: sessionExerciseID,
			SessionID:         sessionID,
		})
		if err != nil {
			return fmt.Errorf("log set: %w", err)
		}
		if logged == 0 {
			writeSessionExerciseNotFound(w)
			return errResponseWritten
		}
		return nil
	})
}

// validNote trims a set or exercise note. If it's too long, it writes a 400
// and returns false.
func validNote(w http.ResponseWriter, note string) (string, bool) {
	note = strings.TrimSpace(note)
	if utf8.RuneCountInString(note) > maxNoteLength {
		httpx.WriteError(w, http.StatusBadRequest, "invalid_note",
			fmt.Sprintf("Notes can be at most %d characters.", maxNoteLength))
		return "", false
	}
	return note, true
}

func writeSessionExerciseNotFound(w http.ResponseWriter) {
	httpx.WriteError(w, http.StatusNotFound, "session_exercise_not_found", "That exercise isn't in this workout.")
}

// finish records the session as done. A session with no sets can't be
// finished; the client offers to discard it instead.
func (h handlers) finish(w http.ResponseWriter, r *http.Request) {
	h.changeSession(w, r, http.StatusOK, func(q *store.Queries, sessionID uuid.UUID) error {
		sets, err := q.CountSessionSets(r.Context(), sessionID)
		if err != nil {
			return fmt.Errorf("count sets: %w", err)
		}
		if sets == 0 {
			httpx.WriteError(w, http.StatusBadRequest, "session_empty", "Log at least one set before finishing.")
			return errResponseWritten
		}
		if err := q.FinishSession(r.Context(), sessionID); err != nil {
			return fmt.Errorf("finish session: %w", err)
		}
		return nil
	})
}

// discard deletes a session in progress. Finished sessions are kept.
func (h handlers) discard(w http.ResponseWriter, r *http.Request) {
	_, ok := h.inSessionInProgress(w, r, func(q *store.Queries, sessionID uuid.UUID) error {
		if err := q.DeleteSession(r.Context(), sessionID); err != nil {
			return fmt.Errorf("delete session: %w", err)
		}
		return nil
	})
	if ok {
		w.WriteHeader(http.StatusNoContent)
	}
}

// errResponseWritten is returned by a changeSession callback that has
// already written its own error response.
var errResponseWritten = errors.New("response written")

// changeSession runs change on the caller's {id} session, as inSessionInProgress
// does, then writes the updated session with status.
func (h handlers) changeSession(w http.ResponseWriter, r *http.Request, status int,
	change func(q *store.Queries, sessionID uuid.UUID) error) {
	if id, ok := h.inSessionInProgress(w, r, change); ok {
		h.writeSession(w, r, status, id)
	}
}

// inSessionInProgress runs change inside a transaction holding the lock on the
// caller's {id} session, and returns that id once committed. It writes a 404
// if the caller has no such session, a 409 if it's finished, and a 500 if
// change fails; in each case it returns false.
func (h handlers) inSessionInProgress(w http.ResponseWriter, r *http.Request,
	change func(q *store.Queries, sessionID uuid.UUID) error) (uuid.UUID, bool) {
	ctx := r.Context()
	caller, _ := auth.AccountID(ctx)
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeSessionNotFound(w)
		return uuid.Nil, false
	}

	tx, err := h.pool.Begin(ctx)
	if err != nil {
		httpx.WriteInternalError(w, r, fmt.Errorf("begin: %w", err))
		return uuid.Nil, false
	}
	defer tx.Rollback(ctx)
	q := h.queries.WithTx(tx)

	finishedAt, err := q.LockSession(ctx, store.LockSessionParams{ID: id, AccountID: caller})
	if errors.Is(err, pgx.ErrNoRows) {
		writeSessionNotFound(w)
		return uuid.Nil, false
	}
	if err != nil {
		httpx.WriteInternalError(w, r, fmt.Errorf("lock session: %w", err))
		return uuid.Nil, false
	}
	if finishedAt != nil {
		httpx.WriteError(w, http.StatusConflict, "session_finished", "This workout is already finished.")
		return uuid.Nil, false
	}
	if err := change(q, id); err != nil {
		if !errors.Is(err, errResponseWritten) {
			httpx.WriteInternalError(w, r, err)
		}
		return uuid.Nil, false
	}
	if err := tx.Commit(ctx); err != nil {
		httpx.WriteInternalError(w, r, fmt.Errorf("commit: %w", err))
		return uuid.Nil, false
	}
	return id, true
}

func writeSessionNotFound(w http.ResponseWriter) {
	httpx.WriteError(w, http.StatusNotFound, "session_not_found", "Workout not found.")
}

func writeExerciseNotFound(w http.ResponseWriter) {
	httpx.WriteError(w, http.StatusNotFound, "exercise_not_found", "Exercise not found.")
}

// writeSession loads the caller's session id and writes it.
func (h handlers) writeSession(w http.ResponseWriter, r *http.Request, status int, id uuid.UUID) {
	session, err := h.loadSession(r.Context(), id)
	if err != nil {
		httpx.WriteInternalError(w, r, err)
		return
	}
	httpx.WriteJSON(w, status, session)
}

// loadSession loads the caller's session id with its exercises and sets.
// It returns pgx.ErrNoRows when the caller has no such session.
func (h handlers) loadSession(ctx context.Context, id uuid.UUID) (Session, error) {
	caller, _ := auth.AccountID(ctx)
	row, err := h.queries.GetSession(ctx, store.GetSessionParams{ID: id, AccountID: caller})
	if err != nil {
		return Session{}, fmt.Errorf("load session: %w", err)
	}
	exerciseRows, err := h.queries.ListSessionExercises(ctx, id)
	if err != nil {
		return Session{}, fmt.Errorf("list session exercises: %w", err)
	}
	setRows, err := h.queries.ListSessionSets(ctx, id)
	if err != nil {
		return Session{}, fmt.Errorf("list session sets: %w", err)
	}

	ids := make([]uuid.UUID, len(exerciseRows))
	for i, e := range exerciseRows {
		ids[i] = e.ExerciseID
	}
	names, err := h.exercises.ExerciseNames(ctx, caller, ids)
	if err != nil {
		return Session{}, err
	}

	sets := make(map[uuid.UUID][]Set)
	for _, s := range setRows {
		sets[s.SessionExerciseID] = append(sets[s.SessionExerciseID], Set{
			ID: s.ID, Weight: s.Weight, WeightUnit: s.WeightUnit, Reps: s.Reps, Note: s.Note,
		})
	}
	session := Session{
		ID:         row.ID,
		StartedAt:  row.StartedAt,
		FinishedAt: row.FinishedAt,
		Exercises:  make([]SessionExercise, len(exerciseRows)),
	}
	for i, e := range exerciseRows {
		session.Exercises[i] = SessionExercise{
			ID:         e.ID,
			ExerciseID: e.ExerciseID,
			Name:       names[e.ExerciseID],
			Note:       e.Note,
			Sets:       append([]Set{}, sets[e.ID]...),
		}
	}
	return session, nil
}

func isViolation(err error, code string) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == code
}
