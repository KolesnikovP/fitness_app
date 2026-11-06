// Package workout owns Sessions: the workouts a User logs, the Exercises
// added to each, the Supersets they're in, and the Sets logged for them.
// Exercise names and Muscle groups come from the exercise module through
// Exercises, Routines from the program module through Routines, and the Unit
// preference from the user module through Profiles; this module never reads
// their tables.
package workout

import (
	"context"
	"errors"
	"fmt"
	"math"
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
	"github.com/KolesnikovP/fitness_app/backend/internal/program"
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
	// ExerciseMuscleGroups returns the Muscle groups of the given exercises
	// that callerID may see, keyed by id, leaving out any the caller can't see.
	ExerciseMuscleGroups(ctx context.Context, callerID uuid.UUID, ids []uuid.UUID) (map[uuid.UUID]string, error)
}

// Profiles is the part of the user module this module depends on.
type Profiles interface {
	// UnitPreference returns "kg" or "lb": the unit accountID sees weights
	// in, "kg" if they haven't chosen.
	UnitPreference(ctx context.Context, accountID uuid.UUID) (string, error)
}

// Routines is the part of the program module this module depends on.
type Routines interface {
	// GetRoutine returns callerID's routine, or program.ErrRoutineNotFound if
	// the caller has no such routine.
	GetRoutine(ctx context.Context, callerID, routineID uuid.UUID) (program.Routine, error)
	// CreateRoutine saves a new routine for callerID, or returns a
	// *program.InvalidRoutineError if input can't be saved.
	CreateRoutine(ctx context.Context, callerID uuid.UUID, input program.RoutineInput) (program.Routine, error)
	// RoutineNames returns the names of those of ids that are callerID's
	// routines, keyed by id.
	RoutineNames(ctx context.Context, callerID uuid.UUID, ids []uuid.UUID) (map[uuid.UUID]string, error)
}

type Service struct {
	pool      *pgxpool.Pool
	queries   *store.Queries
	exercises Exercises
	routines  Routines
	profiles  Profiles
}

func NewService(pool *pgxpool.Pool, exercises Exercises, routines Routines, profiles Profiles) *Service {
	return &Service{pool: pool, queries: store.New(pool), exercises: exercises, routines: routines, profiles: profiles}
}

// Session is one logged workout as the API returns it. RoutineID is the
// Routine it was started from, null for a freeform Session (or once that
// Routine is deleted), and RoutineName that Routine's name as it is now.
// FinishedAt and Stats are null while the Session is in progress.
type Session struct {
	ID          uuid.UUID         `json:"id"`
	RoutineID   *uuid.UUID        `json:"routineId"`
	RoutineName *string           `json:"routineName"`
	StartedAt   time.Time         `json:"startedAt"`
	FinishedAt  *time.Time        `json:"finishedAt"`
	Exercises   []SessionExercise `json:"exercises"`
	Stats       *Stats            `json:"stats"`
	// PersonalRecords are the records its Sets set (so far, while in
	// progress), in the order logged.
	PersonalRecords []PersonalRecord `json:"personalRecords"`
}

// SessionExercise is an Exercise added to a Session, with its Sets in the
// order they were logged. ExerciseID and Name are the Exercise being done
// now. SupersetID is shared by the exercises of one Superset, and null for an
// exercise in none. Target is what its Routine's slot planned, and Planned
// the slot's own Exercise, both null for an exercise added during the
// Session. It can be swapped to Planned or one of its Substitutes.
type SessionExercise struct {
	ID          uuid.UUID     `json:"id"`
	ExerciseID  uuid.UUID     `json:"exerciseId"`
	Name        string        `json:"name"`
	Note        string        `json:"note"`
	SupersetID  *uuid.UUID    `json:"supersetId"`
	Target      *Target       `json:"target"`
	Planned     *ExerciseRef  `json:"planned"`
	Substitutes []ExerciseRef `json:"substitutes"`
	Sets        []Set         `json:"sets"`
}

// ExerciseRef names an Exercise.
type ExerciseRef struct {
	ExerciseID uuid.UUID `json:"exerciseId"`
	Name       string    `json:"name"`
}

// Target is a copy of an Exercise slot's plan, taken when the Session started.
// Weight is in WeightUnit; RestSeconds is null when no rest was planned.
type Target struct {
	Sets        int32   `json:"sets"`
	Reps        int32   `json:"reps"`
	Weight      float64 `json:"weight"`
	WeightUnit  string  `json:"weightUnit"`
	RestSeconds *int32  `json:"restSeconds"`
	Note        string  `json:"note"`
}

// Set is one logged Set. ExerciseID and Name are the Exercise actually done,
// which differs from its Session exercise's when that's been swapped since.
// Weight is in WeightUnit, the unit it was logged in. RPE is null when the
// User left it blank. SupersetID is the Superset its exercise was in when it
// was logged, if any. RecordTier is its Record tier: "gold", "silver",
// "bronze", or null for none.
type Set struct {
	ID         uuid.UUID   `json:"id"`
	ExerciseID uuid.UUID   `json:"exerciseId"`
	Name       string      `json:"name"`
	Weight     float64     `json:"weight"`
	WeightUnit string      `json:"weightUnit"`
	Reps       int32       `json:"reps"`
	RPE        *float64    `json:"rpe"`
	Note       string      `json:"note"`
	SupersetID *uuid.UUID  `json:"supersetId"`
	RecordTier *RecordTier `json:"recordTier"`
}

// SessionSummary is a finished Session as the History lists it. RoutineName
// and PersonalRecords are as on Session.
type SessionSummary struct {
	ID              uuid.UUID        `json:"id"`
	RoutineName     *string          `json:"routineName"`
	StartedAt       time.Time        `json:"startedAt"`
	FinishedAt      time.Time        `json:"finishedAt"`
	ExerciseNames   []string         `json:"exerciseNames"`
	Stats           Stats            `json:"stats"`
	PersonalRecords []PersonalRecord `json:"personalRecords"`
}

func (s *Service) Routes(mux *http.ServeMux, accounts Accounts) {
	h := handlers{pool: s.pool, queries: s.queries, exercises: s.exercises, routines: s.routines, profiles: s.profiles}
	mux.Handle("POST /workouts/sessions", accounts.RequireAuth(http.HandlerFunc(h.start)))
	mux.Handle("GET /workouts/sessions", accounts.RequireAuth(http.HandlerFunc(h.history)))
	mux.Handle("GET /workouts/sessions/current", accounts.RequireAuth(http.HandlerFunc(h.current)))
	mux.Handle("GET /workouts/sessions/{id}", accounts.RequireAuth(http.HandlerFunc(h.get)))
	mux.Handle("GET /workouts/exercises/{id}/records", accounts.RequireAuth(http.HandlerFunc(h.exerciseRecords)))
	mux.Handle("GET /workouts/exercises/{id}/progress", accounts.RequireAuth(http.HandlerFunc(h.exerciseProgress)))
	mux.Handle("GET /workouts/totals", accounts.RequireAuth(http.HandlerFunc(h.totals)))
	mux.Handle("POST /workouts/sessions/{id}/exercises", accounts.RequireAuth(http.HandlerFunc(h.addExercise)))
	mux.Handle("PATCH /workouts/sessions/{id}/exercises/{sessionExerciseId}", accounts.RequireAuth(http.HandlerFunc(h.changeExercise)))
	mux.Handle("POST /workouts/sessions/{id}/exercises/{sessionExerciseId}/sets", accounts.RequireAuth(http.HandlerFunc(h.logSet)))
	mux.Handle("PATCH /workouts/sessions/{id}/sets/{setId}", accounts.RequireAuth(http.HandlerFunc(h.editSet)))
	mux.Handle("DELETE /workouts/sessions/{id}/sets/{setId}", accounts.RequireAuth(http.HandlerFunc(h.deleteSet)))
	mux.Handle("POST /workouts/sessions/{id}/supersets", accounts.RequireAuth(http.HandlerFunc(h.createSuperset)))
	mux.Handle("DELETE /workouts/sessions/{id}/supersets/{supersetId}", accounts.RequireAuth(http.HandlerFunc(h.ungroupSuperset)))
	mux.Handle("POST /workouts/sessions/{id}/finish", accounts.RequireAuth(http.HandlerFunc(h.finish)))
	mux.Handle("DELETE /workouts/sessions/{id}", accounts.RequireAuth(http.HandlerFunc(h.discard)))
	mux.Handle("POST /workouts/sessions/{id}/routine", accounts.RequireAuth(http.HandlerFunc(h.saveAsRoutine)))
}

// ErrSessionNotFound is returned by FinishedSession when the caller has no
// such finished Session.
var ErrSessionNotFound = errors.New("session not found")

// FinishedSession returns callerID's finished Session id as GET
// /workouts/sessions/{id} does, with its stats and Personal records as they
// are now (ADR 0007), or ErrSessionNotFound if callerID has no such finished
// Session. The feed module uses it through feed.Sessions.
func (s *Service) FinishedSession(ctx context.Context, callerID, id uuid.UUID) (Session, error) {
	h := handlers{pool: s.pool, queries: s.queries, exercises: s.exercises, routines: s.routines, profiles: s.profiles}
	session, err := h.loadSession(ctx, callerID, id)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && session.FinishedAt == nil) {
		return Session{}, ErrSessionNotFound
	}
	return session, err
}

type handlers struct {
	pool      *pgxpool.Pool
	queries   *store.Queries
	exercises Exercises
	routines  Routines
	profiles  Profiles
}

type startBody struct {
	RoutineID *string `json:"routineId"`
}

// start starts a session: freeform with no body, or from {"routineId": ...},
// pre-populated with the routine's slots and their targets.
func (h handlers) start(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	caller, _ := auth.AccountID(ctx)
	var body startBody
	if r.ContentLength != 0 && !httpx.DecodeJSON(w, r, &body) {
		return
	}
	var routineID *uuid.UUID
	var routine program.Routine
	if body.RoutineID != nil {
		id, err := uuid.Parse(*body.RoutineID)
		if err != nil {
			writeRoutineNotFound(w)
			return
		}
		routine, err = h.routines.GetRoutine(ctx, caller, id)
		if errors.Is(err, program.ErrRoutineNotFound) {
			writeRoutineNotFound(w)
			return
		}
		if err != nil {
			httpx.WriteInternalError(w, r, err)
			return
		}
		routineID = &id
	}

	id, err := h.startSession(ctx, caller, routineID, routine.Slots)
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

// startSession starts a session with an exercise for each slot, in order.
// Slots sharing a superset group start in one new Superset.
func (h handlers) startSession(ctx context.Context, caller uuid.UUID, routineID *uuid.UUID,
	slots []program.Slot) (uuid.UUID, error) {
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		return uuid.Nil, fmt.Errorf("begin: %w", err)
	}
	defer tx.Rollback(ctx)
	q := h.queries.WithTx(tx)

	id, err := q.StartSession(ctx, store.StartSessionParams{AccountID: caller, RoutineID: routineID})
	if err != nil {
		return uuid.Nil, err
	}
	supersets := make(map[int32]uuid.UUID)
	for _, slot := range slots {
		var supersetID *uuid.UUID
		if slot.SupersetGroup != nil {
			if _, ok := supersets[*slot.SupersetGroup]; !ok {
				supersets[*slot.SupersetGroup] = uuid.New()
			}
			s := supersets[*slot.SupersetGroup]
			supersetID = &s
		}
		substituteIDs := make([]uuid.UUID, len(slot.Substitutes))
		for i, sub := range slot.Substitutes {
			substituteIDs[i] = sub.ExerciseID
		}
		if err := q.AddPlannedSessionExercise(ctx, store.AddPlannedSessionExerciseParams{
			SessionID:         id,
			ExerciseID:        slot.ExerciseID,
			SubstituteIds:     substituteIDs,
			SupersetID:        supersetID,
			TargetSets:        &slot.TargetSets,
			TargetReps:        &slot.TargetReps,
			TargetWeight:      slot.TargetWeight,
			TargetWeightUnit:  &slot.WeightUnit,
			TargetRestSeconds: slot.RestSeconds,
			TargetNote:        &slot.Note,
		}); err != nil {
			return uuid.Nil, fmt.Errorf("add planned exercise: %w", err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return uuid.Nil, fmt.Errorf("commit: %w", err)
	}
	return id, nil
}

func writeRoutineNotFound(w http.ResponseWriter) {
	httpx.WriteError(w, http.StatusNotFound, "routine_not_found", "Routine not found.")
}

type historyResponse struct {
	Sessions []SessionSummary `json:"sessions"`
}

// history lists the caller's finished sessions, newest first, with their
// stats.
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
	exerciseIDsBySession := make(map[uuid.UUID][]uuid.UUID)
	for _, e := range exerciseRows {
		if !slices.Contains(namesBySession[e.SessionID], names[e.ExerciseID]) {
			namesBySession[e.SessionID] = append(namesBySession[e.SessionID], names[e.ExerciseID])
		}
		if !slices.Contains(exerciseIDsBySession[e.SessionID], e.ExerciseID) {
			exerciseIDsBySession[e.SessionID] = append(exerciseIDsBySession[e.SessionID], e.ExerciseID)
		}
	}
	setsBySession, err := h.setsOfSessions(ctx, sessionIDs)
	if err != nil {
		httpx.WriteInternalError(w, r, err)
		return
	}
	unit, err := h.profiles.UnitPreference(ctx, caller)
	if err != nil {
		httpx.WriteInternalError(w, r, err)
		return
	}
	var setExerciseIDs []uuid.UUID
	for _, sets := range setsBySession {
		for _, s := range sets {
			setExerciseIDs = append(setExerciseIDs, s.exerciseID)
		}
	}
	records, _, err := h.personalRecords(ctx, caller, setExerciseIDs, unit, nil)
	if err != nil {
		httpx.WriteInternalError(w, r, err)
		return
	}
	var routineIDs []uuid.UUID
	for _, row := range rows {
		if row.RoutineID != nil {
			routineIDs = append(routineIDs, *row.RoutineID)
		}
	}
	routineNames, err := h.routines.RoutineNames(ctx, caller, routineIDs)
	if err != nil {
		httpx.WriteInternalError(w, r, err)
		return
	}

	out := make([]SessionSummary, len(rows))
	for i, row := range rows {
		out[i] = SessionSummary{
			ID:            row.ID,
			RoutineName:   routineName(routineNames, row.RoutineID),
			StartedAt:     row.StartedAt,
			FinishedAt:    *row.FinishedAt,
			ExerciseNames: append([]string{}, namesBySession[row.ID]...),
			Stats: statsOf(row.StartedAt, *row.FinishedAt, len(exerciseIDsBySession[row.ID]), setsBySession[row.ID],
				unit),
			PersonalRecords: append([]PersonalRecord{}, records[row.ID]...),
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
	session, err := h.loadSession(r.Context(), callerOf(r), id)
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

type changeExerciseBody struct {
	Note       *string `json:"note"`
	ExerciseID *string `json:"exerciseId"`
}

// changeExercise sets a session exercise's note, swaps its exercise to the
// planned one or one of its Substitutes, or both. Sets logged after a swap
// record the exercise swapped to; the Routine isn't changed.
func (h handlers) changeExercise(w http.ResponseWriter, r *http.Request) {
	var body changeExerciseBody
	if !httpx.DecodeJSON(w, r, &body) {
		return
	}
	if body.Note == nil && body.ExerciseID == nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid_note",
			"Send a note (an empty one clears it), or an exerciseId to swap to.")
		return
	}
	var note string
	if body.Note != nil {
		var ok bool
		if note, ok = validNote(w, *body.Note); !ok {
			return
		}
	}
	var swapTo uuid.UUID
	if body.ExerciseID != nil {
		var err error
		if swapTo, err = uuid.Parse(*body.ExerciseID); err != nil {
			writeInvalidSwap(w)
			return
		}
	}
	sessionExerciseID, err := uuid.Parse(r.PathValue("sessionExerciseId"))
	if err != nil {
		writeSessionExerciseNotFound(w)
		return
	}

	h.changeSession(w, r, http.StatusOK, func(q *store.Queries, sessionID uuid.UUID) error {
		options, err := q.GetSwapOptions(r.Context(), store.GetSwapOptionsParams{ID: sessionExerciseID, SessionID: sessionID})
		if errors.Is(err, pgx.ErrNoRows) {
			writeSessionExerciseNotFound(w)
			return errResponseWritten
		}
		if err != nil {
			return fmt.Errorf("get swap options: %w", err)
		}
		if body.ExerciseID != nil {
			if options.PlannedExerciseID == nil ||
				(swapTo != *options.PlannedExerciseID && !slices.Contains(options.SubstituteIds, swapTo)) {
				writeInvalidSwap(w)
				return errResponseWritten
			}
			if err := q.SwapExercise(r.Context(), store.SwapExerciseParams{
				ID: sessionExerciseID, SessionID: sessionID, ExerciseID: swapTo,
			}); err != nil {
				return fmt.Errorf("swap exercise: %w", err)
			}
		}
		if body.Note != nil {
			if _, err := q.SetSessionExerciseNote(r.Context(), store.SetSessionExerciseNoteParams{
				ID: sessionExerciseID, SessionID: sessionID, Note: note,
			}); err != nil {
				return fmt.Errorf("set exercise note: %w", err)
			}
		}
		return nil
	})
}

func writeInvalidSwap(w http.ResponseWriter) {
	httpx.WriteError(w, http.StatusBadRequest, "invalid_swap",
		"Swap only to the exercise the routine planned, or one of its substitutes.")
}

// setBody is a Set as the client sends it, to log or to correct.
type setBody struct {
	Weight     *float64 `json:"weight"`
	WeightUnit string   `json:"weightUnit"`
	Reps       *int     `json:"reps"`
	RPE        *float64 `json:"rpe"`
	Note       string   `json:"note"`
}

// Limits matching the session_sets CHECK constraints.
const (
	maxWeight     = 9999.99
	maxReps       = 1000
	maxNoteLength = 500
	minRPE        = 1
	maxRPE        = 10
)

// validRPE reports whether rpe is blank or from 1 to 10 in half steps.
func validRPE(rpe *float64) bool {
	if rpe == nil {
		return true
	}
	return *rpe >= minRPE && *rpe <= maxRPE && *rpe*2 == math.Trunc(*rpe*2)
}

// setValues is a validated setBody.
type setValues struct {
	weight     float64
	weightUnit string
	reps       int32
	rpe        *float64
	note       string
}

// validSet decodes and validates a Set from the request body. If it's not
// valid, it writes a 400 and returns false.
func validSet(w http.ResponseWriter, r *http.Request) (setValues, bool) {
	var body setBody
	if !httpx.DecodeJSON(w, r, &body) {
		return setValues{}, false
	}
	if body.Weight == nil || *body.Weight < 0 || *body.Weight > maxWeight {
		httpx.WriteError(w, http.StatusBadRequest, "invalid_weight",
			fmt.Sprintf("Weight must be from 0 to %g.", maxWeight))
		return setValues{}, false
	}
	if body.WeightUnit != "kg" && body.WeightUnit != "lb" {
		httpx.WriteError(w, http.StatusBadRequest, "invalid_weight_unit", `weightUnit must be "kg" or "lb".`)
		return setValues{}, false
	}
	if body.Reps == nil || *body.Reps < 1 || *body.Reps > maxReps {
		httpx.WriteError(w, http.StatusBadRequest, "invalid_reps", fmt.Sprintf("Reps must be from 1 to %d.", maxReps))
		return setValues{}, false
	}
	if !validRPE(body.RPE) {
		httpx.WriteError(w, http.StatusBadRequest, "invalid_rpe",
			fmt.Sprintf("RPE must be from %d to %d in half steps, or left blank.", minRPE, maxRPE))
		return setValues{}, false
	}
	note, ok := validNote(w, body.Note)
	if !ok {
		return setValues{}, false
	}
	return setValues{
		weight: *body.Weight, weightUnit: body.WeightUnit, reps: int32(*body.Reps), rpe: body.RPE, note: note,
	}, true
}

func (h handlers) logSet(w http.ResponseWriter, r *http.Request) {
	set, ok := validSet(w, r)
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
			Weight:            set.weight,
			WeightUnit:        set.weightUnit,
			Reps:              set.reps,
			Note:              set.note,
			Rpe:               set.rpe,
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

// editSet corrects a logged Set. It keeps its place and the Superset it was
// logged in.
func (h handlers) editSet(w http.ResponseWriter, r *http.Request) {
	set, ok := validSet(w, r)
	if !ok {
		return
	}
	setID, err := uuid.Parse(r.PathValue("setId"))
	if err != nil {
		writeSetNotFound(w)
		return
	}

	h.changeSession(w, r, http.StatusOK, func(q *store.Queries, sessionID uuid.UUID) error {
		updated, err := q.UpdateSet(r.Context(), store.UpdateSetParams{
			Weight: set.weight, WeightUnit: set.weightUnit, Reps: set.reps, Rpe: set.rpe, Note: set.note,
			ID: setID, SessionID: sessionID,
		})
		if err != nil {
			return fmt.Errorf("update set: %w", err)
		}
		if updated == 0 {
			writeSetNotFound(w)
			return errResponseWritten
		}
		return nil
	})
}

// deleteSet deletes a logged Set from a session in progress.
func (h handlers) deleteSet(w http.ResponseWriter, r *http.Request) {
	setID, err := uuid.Parse(r.PathValue("setId"))
	if err != nil {
		writeSetNotFound(w)
		return
	}

	h.changeSession(w, r, http.StatusOK, func(q *store.Queries, sessionID uuid.UUID) error {
		deleted, err := q.DeleteSet(r.Context(), store.DeleteSetParams{ID: setID, SessionID: sessionID})
		if err != nil {
			return fmt.Errorf("delete set: %w", err)
		}
		if deleted == 0 {
			writeSetNotFound(w)
			return errResponseWritten
		}
		return nil
	})
}

func writeSetNotFound(w http.ResponseWriter) {
	httpx.WriteError(w, http.StatusNotFound, "set_not_found", "That set isn't in this workout.")
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

type createSupersetBody struct {
	SessionExerciseIDs []string `json:"sessionExerciseIds"`
}

// createSuperset groups two or more of the session's exercises, none already
// in a Superset, into a new Superset.
func (h handlers) createSuperset(w http.ResponseWriter, r *http.Request) {
	var body createSupersetBody
	if !httpx.DecodeJSON(w, r, &body) {
		return
	}
	var ids []uuid.UUID
	for _, raw := range body.SessionExerciseIDs {
		id, err := uuid.Parse(raw)
		if err != nil {
			writeSessionExerciseNotFound(w)
			return
		}
		if !slices.Contains(ids, id) {
			ids = append(ids, id)
		}
	}
	if len(ids) < 2 {
		httpx.WriteError(w, http.StatusBadRequest, "invalid_superset", "A superset needs at least two different exercises.")
		return
	}

	h.changeSession(w, r, http.StatusCreated, func(q *store.Queries, sessionID uuid.UUID) error {
		found, err := q.ListSupersetsOf(r.Context(), store.ListSupersetsOfParams{SessionID: sessionID, Ids: ids})
		if err != nil {
			return fmt.Errorf("list supersets of exercises: %w", err)
		}
		if len(found) != len(ids) {
			writeSessionExerciseNotFound(w)
			return errResponseWritten
		}
		for _, e := range found {
			if e.SupersetID != nil {
				httpx.WriteError(w, http.StatusConflict, "already_in_superset",
					"One of those exercises is already in a superset. Ungroup it first.")
				return errResponseWritten
			}
		}
		supersetID := uuid.New()
		if err := q.AssignSuperset(r.Context(), store.AssignSupersetParams{
			SupersetID: &supersetID, SessionID: sessionID, Ids: ids,
		}); err != nil {
			return fmt.Errorf("assign superset: %w", err)
		}
		return nil
	})
}

// ungroupSuperset takes the exercises of a Superset out of it. Sets already
// logged keep the Superset they were logged in.
func (h handlers) ungroupSuperset(w http.ResponseWriter, r *http.Request) {
	supersetID, err := uuid.Parse(r.PathValue("supersetId"))
	if err != nil {
		writeSupersetNotFound(w)
		return
	}
	h.changeSession(w, r, http.StatusOK, func(q *store.Queries, sessionID uuid.UUID) error {
		ungrouped, err := q.UngroupSuperset(r.Context(), store.UngroupSupersetParams{SessionID: sessionID, SupersetID: &supersetID})
		if err != nil {
			return fmt.Errorf("ungroup superset: %w", err)
		}
		if ungrouped == 0 {
			writeSupersetNotFound(w)
			return errResponseWritten
		}
		return nil
	})
}

func writeSupersetNotFound(w http.ResponseWriter) {
	httpx.WriteError(w, http.StatusNotFound, "superset_not_found", "That superset isn't in this workout.")
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

type saveAsRoutineBody struct {
	Name string `json:"name"`
}

// saveAsRoutine saves a finished session as a new routine, and returns the
// routine as POST /routines does.
func (h handlers) saveAsRoutine(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	caller, _ := auth.AccountID(ctx)
	var body saveAsRoutineBody
	if !httpx.DecodeJSON(w, r, &body) {
		return
	}
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeSessionNotFound(w)
		return
	}
	session, err := h.loadSession(ctx, caller, id)
	if errors.Is(err, pgx.ErrNoRows) {
		writeSessionNotFound(w)
		return
	}
	if err != nil {
		httpx.WriteInternalError(w, r, err)
		return
	}
	if session.FinishedAt == nil {
		httpx.WriteError(w, http.StatusConflict, "session_not_finished",
			"Finish the workout before saving it as a routine.")
		return
	}

	routine, err := h.routines.CreateRoutine(ctx, caller, routineInputOf(body.Name, session))
	var bad *program.InvalidRoutineError
	if errors.As(err, &bad) {
		bad.Write(w)
		return
	}
	if err != nil {
		httpx.WriteInternalError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, routine)
}

// routineInputOf describes a routine like session: a slot for each exercise
// that has Sets, of the Exercise its last Set was done with, targeting as many
// Sets as were logged at the last one's weight and reps, and the Supersets
// that still have two or more such exercises.
func routineInputOf(name string, session Session) program.RoutineInput {
	var logged []SessionExercise
	supersetSizes := make(map[uuid.UUID]int)
	for _, e := range session.Exercises {
		if len(e.Sets) == 0 {
			continue
		}
		logged = append(logged, e)
		if e.SupersetID != nil {
			supersetSizes[*e.SupersetID]++
		}
	}

	input := program.RoutineInput{Name: name, Slots: make([]program.SlotInput, len(logged))}
	groups := make(map[uuid.UUID]int32)
	for i, e := range logged {
		last := e.Sets[len(e.Sets)-1]
		slot := program.SlotInput{
			ExerciseID:   last.ExerciseID,
			TargetSets:   int32(min(len(e.Sets), program.MaxTargetSets)),
			TargetReps:   last.Reps,
			TargetWeight: last.Weight,
			WeightUnit:   last.WeightUnit,
		}
		if e.SupersetID != nil && supersetSizes[*e.SupersetID] >= 2 {
			if _, ok := groups[*e.SupersetID]; !ok {
				groups[*e.SupersetID] = int32(len(groups) + 1)
			}
			g := groups[*e.SupersetID]
			slot.SupersetGroup = &g
		}
		input.Slots[i] = slot
	}
	return input
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

// writeSession loads the caller's session id and writes it, or a 404 if the
// caller has no such session.
func (h handlers) writeSession(w http.ResponseWriter, r *http.Request, status int, id uuid.UUID) {
	session, err := h.loadSession(r.Context(), callerOf(r), id)
	if errors.Is(err, pgx.ErrNoRows) {
		writeSessionNotFound(w)
		return
	}
	if err != nil {
		httpx.WriteInternalError(w, r, err)
		return
	}
	httpx.WriteJSON(w, status, session)
}

// callerOf returns the signed-in caller of r.
func callerOf(r *http.Request) uuid.UUID {
	caller, _ := auth.AccountID(r.Context())
	return caller
}

// loadSession loads caller's session id with its exercises and sets, and its
// stats once finished. It returns pgx.ErrNoRows when caller has no such session.
func (h handlers) loadSession(ctx context.Context, caller, id uuid.UUID) (Session, error) {
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

	var ids []uuid.UUID
	for _, e := range exerciseRows {
		ids = append(append(ids, e.ExerciseID), e.SubstituteIds...)
		if e.PlannedExerciseID != nil {
			ids = append(ids, *e.PlannedExerciseID)
		}
	}
	for _, s := range setRows {
		ids = append(ids, s.ExerciseID)
	}
	names, err := h.exercises.ExerciseNames(ctx, caller, ids)
	if err != nil {
		return Session{}, err
	}

	sets := make(map[uuid.UUID][]Set)
	for _, s := range setRows {
		sets[s.SessionExerciseID] = append(sets[s.SessionExerciseID], Set{
			ID: s.ID, ExerciseID: s.ExerciseID, Name: names[s.ExerciseID], Weight: s.Weight, WeightUnit: s.WeightUnit, Reps: s.Reps, RPE: s.Rpe, Note: s.Note,
			SupersetID: s.SupersetID,
		})
	}
	session := Session{
		ID:         row.ID,
		RoutineID:  row.RoutineID,
		StartedAt:  row.StartedAt,
		FinishedAt: row.FinishedAt,
		Exercises:  make([]SessionExercise, len(exerciseRows)),
	}
	for i, e := range exerciseRows {
		session.Exercises[i] = SessionExercise{
			ID:          e.ID,
			ExerciseID:  e.ExerciseID,
			Name:        names[e.ExerciseID],
			Note:        e.Note,
			SupersetID:  e.SupersetID,
			Target:      targetOf(e),
			Substitutes: make([]ExerciseRef, len(e.SubstituteIds)),
			Sets:        append([]Set{}, sets[e.ID]...),
		}
		if e.PlannedExerciseID != nil {
			session.Exercises[i].Planned = &ExerciseRef{ExerciseID: *e.PlannedExerciseID, Name: names[*e.PlannedExerciseID]}
		}
		for j, id := range e.SubstituteIds {
			session.Exercises[i].Substitutes[j] = ExerciseRef{ExerciseID: id, Name: names[id]}
		}
	}
	if session.Stats, err = h.sessionStats(ctx, caller, session); err != nil {
		return Session{}, err
	}
	unit, err := h.profiles.UnitPreference(ctx, caller)
	if err != nil {
		return Session{}, err
	}
	var setExerciseIDs []uuid.UUID
	var inProgress []store.ListFinishedSetsOfExercisesRow
	for _, s := range setRows {
		setExerciseIDs = append(setExerciseIDs, s.ExerciseID)
		if session.FinishedAt == nil {
			inProgress = append(inProgress, store.ListFinishedSetsOfExercisesRow{
				SessionID: session.ID, ID: s.ID, ExerciseID: s.ExerciseID, Weight: s.Weight,
				WeightUnit: s.WeightUnit, Reps: s.Reps,
			})
		}
	}
	records, tiers, err := h.personalRecords(ctx, caller, setExerciseIDs, unit, inProgress)
	if err != nil {
		return Session{}, err
	}
	session.PersonalRecords = append([]PersonalRecord{}, records[session.ID]...)
	for _, e := range session.Exercises {
		for j := range e.Sets {
			if tier, ok := tiers[e.Sets[j].ID]; ok {
				e.Sets[j].RecordTier = &tier
			}
		}
	}
	if row.RoutineID != nil {
		routineNames, err := h.routines.RoutineNames(ctx, caller, []uuid.UUID{*row.RoutineID})
		if err != nil {
			return Session{}, err
		}
		session.RoutineName = routineName(routineNames, row.RoutineID)
	}
	return session, nil
}

// routineName looks up routineID in names, or returns nil if it's nil or
// not there.
func routineName(names map[uuid.UUID]string, routineID *uuid.UUID) *string {
	if routineID == nil {
		return nil
	}
	if name, ok := names[*routineID]; ok {
		return &name
	}
	return nil
}

// targetOf returns a session exercise's target, or nil if it has none.
func targetOf(e store.ListSessionExercisesRow) *Target {
	if e.TargetSets == nil {
		return nil
	}
	return &Target{
		Sets:        *e.TargetSets,
		Reps:        *e.TargetReps,
		Weight:      *e.TargetWeight,
		WeightUnit:  *e.TargetWeightUnit,
		RestSeconds: e.TargetRestSeconds,
		Note:        *e.TargetNote,
	}
}

func isViolation(err error, code string) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == code
}
