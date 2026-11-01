// Package program owns Routines: the reusable workouts a User plans, each an
// ordered list of Exercise slots with Targets. Routines live in a week of a
// Program (program → weeks → routines → exercise_slots), though v1 gives each
// User one default Program with a single week and shows neither. Exercise
// names come from the exercise module through Exercises.
package program

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
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/KolesnikovP/fitness_app/backend/internal/auth"
	"github.com/KolesnikovP/fitness_app/backend/internal/platform/httpx"
	"github.com/KolesnikovP/fitness_app/backend/internal/program/store"
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

// Routine is a saved Routine as the API returns it, its slots in order.
type Routine struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	UpdatedAt time.Time `json:"updatedAt"`
	Slots     []Slot    `json:"slots"`
}

// Slot is one Exercise slot of a Routine: the Exercise and its Target.
// TargetWeight is in WeightUnit. RestSeconds is null when no rest is planned.
// Slots sharing a SupersetGroup (numbered from 1 in Routine order) are a
// planned Superset; it's null for a slot in none.
type Slot struct {
	ID            uuid.UUID `json:"id"`
	ExerciseID    uuid.UUID `json:"exerciseId"`
	Name          string    `json:"name"`
	TargetSets    int32     `json:"targetSets"`
	TargetReps    int32     `json:"targetReps"`
	TargetWeight  float64   `json:"targetWeight"`
	WeightUnit    string    `json:"weightUnit"`
	RestSeconds   *int32    `json:"restSeconds"`
	Note          string    `json:"note"`
	SupersetGroup *int32    `json:"supersetGroup"`
}

// RoutineInput is a Routine to save: its name and slots in order.
type RoutineInput struct {
	Name  string
	Slots []SlotInput
}

// SlotInput is an Exercise slot to save, without its id or name.
type SlotInput struct {
	ExerciseID    uuid.UUID
	TargetSets    int32
	TargetReps    int32
	TargetWeight  float64
	WeightUnit    string
	RestSeconds   *int32
	Note          string
	SupersetGroup *int32
}

// Limits matching the routines and exercise_slots CHECK constraints.
const (
	maxNameLength  = 100
	maxSlots       = 50
	MaxTargetSets  = 20
	maxTargetReps  = 1000
	maxWeight      = 9999.99
	maxRestSeconds = 3600
	maxNoteLength  = 500
)

// InvalidRoutineError is a RoutineInput that can't be saved, with the error
// response the API sends for it.
type InvalidRoutineError struct {
	Status  int
	Code    string
	Message string
}

func (e *InvalidRoutineError) Error() string { return e.Code + ": " + e.Message }

// Write writes the error response.
func (e *InvalidRoutineError) Write(w http.ResponseWriter) {
	httpx.WriteError(w, e.Status, e.Code, e.Message)
}

func invalid(code, message string) *InvalidRoutineError {
	return &InvalidRoutineError{Status: http.StatusBadRequest, Code: code, Message: message}
}

// CreateRoutine saves a new Routine for callerID. If input can't be saved, it
// returns an *InvalidRoutineError. The workout module uses it, through
// workout.Routines, to save a Session as a Routine.
func (s *Service) CreateRoutine(ctx context.Context, callerID uuid.UUID, input RoutineInput) (Routine, error) {
	input, err := s.validate(ctx, callerID, input)
	if err != nil {
		return Routine{}, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Routine{}, fmt.Errorf("begin: %w", err)
	}
	defer tx.Rollback(ctx)
	q := s.queries.WithTx(tx)

	if err := q.EnsureDefaultProgram(ctx, callerID); err != nil {
		return Routine{}, fmt.Errorf("ensure default program: %w", err)
	}
	weekID, err := q.EnsureFirstWeek(ctx, callerID)
	if err != nil {
		return Routine{}, fmt.Errorf("ensure first week: %w", err)
	}
	id, err := q.CreateRoutine(ctx, store.CreateRoutineParams{WeekID: weekID, Name: input.Name})
	if err != nil {
		return Routine{}, fmt.Errorf("create routine: %w", err)
	}
	if err := addSlots(ctx, q, id, input.Slots); err != nil {
		return Routine{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Routine{}, fmt.Errorf("commit: %w", err)
	}
	return s.loadRoutine(ctx, callerID, id)
}

// ErrRoutineNotFound is returned for a routine the caller doesn't have.
var ErrRoutineNotFound = errors.New("routine not found")

// GetRoutine returns callerID's routine id, or ErrRoutineNotFound. The
// workout module uses it, through workout.Routines, to start a Session from a
// Routine.
func (s *Service) GetRoutine(ctx context.Context, callerID, id uuid.UUID) (Routine, error) {
	routine, err := s.loadRoutine(ctx, callerID, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return Routine{}, ErrRoutineNotFound
	}
	return routine, err
}

func addSlots(ctx context.Context, q *store.Queries, routineID uuid.UUID, slots []SlotInput) error {
	for i, slot := range slots {
		if err := q.AddSlot(ctx, store.AddSlotParams{
			RoutineID:        routineID,
			Position:         int32(i + 1),
			ExerciseID:       slot.ExerciseID,
			TargetSets:       slot.TargetSets,
			TargetReps:       slot.TargetReps,
			TargetWeight:     slot.TargetWeight,
			TargetWeightUnit: slot.WeightUnit,
			RestSeconds:      slot.RestSeconds,
			Note:             slot.Note,
			SupersetGroup:    slot.SupersetGroup,
		}); err != nil {
			return fmt.Errorf("add slot: %w", err)
		}
	}
	return nil
}

// validate checks a RoutineInput and returns it tidied: the name and notes trimmed,
// and Superset groups numbered from 1 in the order they first appear.
func (s *Service) validate(ctx context.Context, callerID uuid.UUID, input RoutineInput) (RoutineInput, error) {
	name := strings.TrimSpace(input.Name)
	if n := utf8.RuneCountInString(name); n < 1 || n > maxNameLength {
		return RoutineInput{}, invalid("invalid_name", fmt.Sprintf("Name must be 1 to %d characters.", maxNameLength))
	}
	if len(input.Slots) == 0 {
		return RoutineInput{}, invalid("invalid_slots", "Add at least one exercise.")
	}
	if len(input.Slots) > maxSlots {
		return RoutineInput{}, invalid("invalid_slots", fmt.Sprintf("A routine can have at most %d exercises.", maxSlots))
	}

	slots := make([]SlotInput, len(input.Slots))
	groupSizes := make(map[int32]int)
	var groupOrder []int32
	var exerciseIDs []uuid.UUID
	for i, slot := range input.Slots {
		if slot.TargetSets < 1 || slot.TargetSets > MaxTargetSets {
			return RoutineInput{}, invalid("invalid_target_sets", fmt.Sprintf("Target sets must be from 1 to %d.", MaxTargetSets))
		}
		if slot.TargetReps < 1 || slot.TargetReps > maxTargetReps {
			return RoutineInput{}, invalid("invalid_target_reps", fmt.Sprintf("Target reps must be from 1 to %d.", maxTargetReps))
		}
		if slot.TargetWeight < 0 || slot.TargetWeight > maxWeight {
			return RoutineInput{}, invalid("invalid_target_weight", fmt.Sprintf("Target weight must be from 0 to %g.", maxWeight))
		}
		if slot.WeightUnit != "kg" && slot.WeightUnit != "lb" {
			return RoutineInput{}, invalid("invalid_weight_unit", `weightUnit must be "kg" or "lb".`)
		}
		if slot.RestSeconds != nil && (*slot.RestSeconds < 1 || *slot.RestSeconds > maxRestSeconds) {
			return RoutineInput{}, invalid("invalid_rest",
				fmt.Sprintf("Rest must be from 1 to %d seconds, or left blank.", maxRestSeconds))
		}
		note := strings.TrimSpace(slot.Note)
		if utf8.RuneCountInString(note) > maxNoteLength {
			return RoutineInput{}, invalid("invalid_note", fmt.Sprintf("Notes can be at most %d characters.", maxNoteLength))
		}
		if g := slot.SupersetGroup; g != nil {
			if *g < 1 {
				return RoutineInput{}, invalid("invalid_superset", "supersetGroup must be a positive number, or null.")
			}
			if groupSizes[*g] == 0 {
				groupOrder = append(groupOrder, *g)
			}
			groupSizes[*g]++
		}
		slot.Note = note
		slots[i] = slot
		if !slices.Contains(exerciseIDs, slot.ExerciseID) {
			exerciseIDs = append(exerciseIDs, slot.ExerciseID)
		}
	}
	for _, size := range groupSizes {
		if size < 2 {
			return RoutineInput{}, invalid("invalid_superset", "A superset needs at least two exercises.")
		}
	}
	for i, slot := range slots {
		if slot.SupersetGroup != nil {
			n := int32(slices.Index(groupOrder, *slot.SupersetGroup) + 1)
			slots[i].SupersetGroup = &n
		}
	}

	names, err := s.exercises.ExerciseNames(ctx, callerID, exerciseIDs)
	if err != nil {
		return RoutineInput{}, err
	}
	if len(names) != len(exerciseIDs) {
		return RoutineInput{}, &InvalidRoutineError{Status: http.StatusNotFound, Code: "exercise_not_found", Message: "Exercise not found."}
	}
	return RoutineInput{Name: name, Slots: slots}, nil
}

// loadRoutine loads callerID's routine id with its slots. It returns
// pgx.ErrNoRows when the caller has no such routine.
func (s *Service) loadRoutine(ctx context.Context, callerID, id uuid.UUID) (Routine, error) {
	row, err := s.queries.GetRoutine(ctx, store.GetRoutineParams{ID: id, AccountID: callerID})
	if err != nil {
		return Routine{}, fmt.Errorf("get routine: %w", err)
	}
	slotRows, err := s.queries.ListSlotsOfRoutines(ctx, []uuid.UUID{id})
	if err != nil {
		return Routine{}, fmt.Errorf("list slots: %w", err)
	}
	exerciseIDs := make([]uuid.UUID, len(slotRows))
	for i, slot := range slotRows {
		exerciseIDs[i] = slot.ExerciseID
	}
	names, err := s.exercises.ExerciseNames(ctx, callerID, exerciseIDs)
	if err != nil {
		return Routine{}, err
	}
	routine := Routine{ID: row.ID, Name: row.Name, UpdatedAt: row.UpdatedAt, Slots: make([]Slot, len(slotRows))}
	for i, slot := range slotRows {
		routine.Slots[i] = Slot{
			ID:            slot.ID,
			ExerciseID:    slot.ExerciseID,
			Name:          names[slot.ExerciseID],
			TargetSets:    slot.TargetSets,
			TargetReps:    slot.TargetReps,
			TargetWeight:  slot.TargetWeight,
			WeightUnit:    slot.TargetWeightUnit,
			RestSeconds:   slot.RestSeconds,
			Note:          slot.Note,
			SupersetGroup: slot.SupersetGroup,
		}
	}
	return routine, nil
}

func (s *Service) Routes(mux *http.ServeMux, accounts Accounts) {
	mux.Handle("GET /routines", accounts.RequireAuth(http.HandlerFunc(s.list)))
	mux.Handle("POST /routines", accounts.RequireAuth(http.HandlerFunc(s.create)))
	mux.Handle("GET /routines/{id}", accounts.RequireAuth(http.HandlerFunc(s.get)))
	mux.Handle("PUT /routines/{id}", accounts.RequireAuth(http.HandlerFunc(s.replace)))
	mux.Handle("DELETE /routines/{id}", accounts.RequireAuth(http.HandlerFunc(s.delete)))
}

// RoutineSummary is a Routine as the list of them shows it: its name and the
// Exercises it plans, each once, in order.
type RoutineSummary struct {
	ID            uuid.UUID `json:"id"`
	Name          string    `json:"name"`
	UpdatedAt     time.Time `json:"updatedAt"`
	ExerciseNames []string  `json:"exerciseNames"`
}

type listResponse struct {
	Routines []RoutineSummary `json:"routines"`
}

// list lists the caller's routines by name.
func (s *Service) list(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	caller, _ := auth.AccountID(ctx)
	rows, err := s.queries.ListRoutines(ctx, caller)
	if err != nil {
		httpx.WriteInternalError(w, r, fmt.Errorf("list routines: %w", err))
		return
	}
	ids := make([]uuid.UUID, len(rows))
	for i, row := range rows {
		ids[i] = row.ID
	}
	slotRows, err := s.queries.ListSlotsOfRoutines(ctx, ids)
	if err != nil {
		httpx.WriteInternalError(w, r, fmt.Errorf("list slots: %w", err))
		return
	}
	exerciseIDs := make([]uuid.UUID, len(slotRows))
	for i, slot := range slotRows {
		exerciseIDs[i] = slot.ExerciseID
	}
	names, err := s.exercises.ExerciseNames(ctx, caller, exerciseIDs)
	if err != nil {
		httpx.WriteInternalError(w, r, err)
		return
	}
	namesByRoutine := make(map[uuid.UUID][]string)
	for _, slot := range slotRows {
		if name := names[slot.ExerciseID]; !slices.Contains(namesByRoutine[slot.RoutineID], name) {
			namesByRoutine[slot.RoutineID] = append(namesByRoutine[slot.RoutineID], name)
		}
	}

	out := make([]RoutineSummary, len(rows))
	for i, row := range rows {
		out[i] = RoutineSummary{
			ID:            row.ID,
			Name:          row.Name,
			UpdatedAt:     row.UpdatedAt,
			ExerciseNames: append([]string{}, namesByRoutine[row.ID]...),
		}
	}
	httpx.WriteJSON(w, http.StatusOK, listResponse{Routines: out})
}

func (s *Service) get(w http.ResponseWriter, r *http.Request) {
	caller, _ := auth.AccountID(r.Context())
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeRoutineNotFound(w)
		return
	}
	routine, err := s.loadRoutine(r.Context(), caller, id)
	if writeRoutineError(w, r, err) {
		return
	}
	httpx.WriteJSON(w, http.StatusOK, routine)
}

// replace replaces a routine's name and slots.
func (s *Service) replace(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	caller, _ := auth.AccountID(ctx)
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeRoutineNotFound(w)
		return
	}
	input, ok := decodeRoutineInput(w, r)
	if !ok {
		return
	}
	routine, err := s.replaceRoutine(ctx, caller, id, input)
	if writeRoutineError(w, r, err) {
		return
	}
	httpx.WriteJSON(w, http.StatusOK, routine)
}

func (s *Service) replaceRoutine(ctx context.Context, callerID, id uuid.UUID, input RoutineInput) (Routine, error) {
	input, err := s.validate(ctx, callerID, input)
	if err != nil {
		return Routine{}, err
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Routine{}, fmt.Errorf("begin: %w", err)
	}
	defer tx.Rollback(ctx)
	q := s.queries.WithTx(tx)

	if _, err := q.LockRoutine(ctx, store.LockRoutineParams{ID: id, AccountID: callerID}); err != nil {
		return Routine{}, fmt.Errorf("lock routine: %w", err)
	}
	if err := q.RenameRoutine(ctx, store.RenameRoutineParams{ID: id, Name: input.Name}); err != nil {
		return Routine{}, fmt.Errorf("rename routine: %w", err)
	}
	if err := q.DeleteSlots(ctx, id); err != nil {
		return Routine{}, fmt.Errorf("delete slots: %w", err)
	}
	if err := addSlots(ctx, q, id, input.Slots); err != nil {
		return Routine{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Routine{}, fmt.Errorf("commit: %w", err)
	}
	return s.loadRoutine(ctx, callerID, id)
}

// delete deletes a routine. Sessions started from it are kept.
func (s *Service) delete(w http.ResponseWriter, r *http.Request) {
	caller, _ := auth.AccountID(r.Context())
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeRoutineNotFound(w)
		return
	}
	deleted, err := s.queries.DeleteRoutine(r.Context(), store.DeleteRoutineParams{ID: id, AccountID: caller})
	if err != nil {
		httpx.WriteInternalError(w, r, fmt.Errorf("delete routine: %w", err))
		return
	}
	if deleted == 0 {
		writeRoutineNotFound(w)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// routineBody is a Routine as the client sends it, to create or replace one.
type routineBody struct {
	Name  string     `json:"name"`
	Slots []slotBody `json:"slots"`
}

type slotBody struct {
	ExerciseID    string   `json:"exerciseId"`
	TargetSets    *int32   `json:"targetSets"`
	TargetReps    *int32   `json:"targetReps"`
	TargetWeight  *float64 `json:"targetWeight"`
	WeightUnit    string   `json:"weightUnit"`
	RestSeconds   *int32   `json:"restSeconds"`
	Note          string   `json:"note"`
	SupersetGroup *int32   `json:"supersetGroup"`
}

// decodeRoutineInput reads a Routine from the request body. If it can't, it writes a
// 4xx and returns false. The input still needs validating.
func decodeRoutineInput(w http.ResponseWriter, r *http.Request) (RoutineInput, bool) {
	var body routineBody
	if !httpx.DecodeJSON(w, r, &body) {
		return RoutineInput{}, false
	}
	input := RoutineInput{Name: body.Name, Slots: make([]SlotInput, len(body.Slots))}
	for i, slot := range body.Slots {
		exerciseID, err := uuid.Parse(slot.ExerciseID)
		if err != nil {
			httpx.WriteError(w, http.StatusNotFound, "exercise_not_found", "Exercise not found.")
			return RoutineInput{}, false
		}
		// A missing number is out of range, so validate refuses it.
		weight := -1.0
		if slot.TargetWeight != nil {
			weight = *slot.TargetWeight
		}
		input.Slots[i] = SlotInput{
			ExerciseID:    exerciseID,
			TargetSets:    valueOr(slot.TargetSets, 0),
			TargetReps:    valueOr(slot.TargetReps, 0),
			TargetWeight:  weight,
			WeightUnit:    slot.WeightUnit,
			RestSeconds:   slot.RestSeconds,
			Note:          slot.Note,
			SupersetGroup: slot.SupersetGroup,
		}
	}
	return input, true
}

func valueOr[T any](p *T, fallback T) T {
	if p == nil {
		return fallback
	}
	return *p
}

func (s *Service) create(w http.ResponseWriter, r *http.Request) {
	input, ok := decodeRoutineInput(w, r)
	if !ok {
		return
	}
	caller, _ := auth.AccountID(r.Context())
	routine, err := s.CreateRoutine(r.Context(), caller, input)
	if writeRoutineError(w, r, err) {
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, routine)
}

// writeRoutineError writes the response for an error loading or saving a
// Routine, and reports whether there was one.
func writeRoutineError(w http.ResponseWriter, r *http.Request, err error) bool {
	if err == nil {
		return false
	}
	var bad *InvalidRoutineError
	if errors.As(err, &bad) {
		bad.Write(w)
	} else if errors.Is(err, pgx.ErrNoRows) {
		writeRoutineNotFound(w)
	} else {
		httpx.WriteInternalError(w, r, err)
	}
	return true
}

func writeRoutineNotFound(w http.ResponseWriter) {
	httpx.WriteError(w, http.StatusNotFound, "routine_not_found", "Routine not found.")
}
