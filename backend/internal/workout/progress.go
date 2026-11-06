package workout

import (
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"

	"github.com/KolesnikovP/fitness_app/backend/internal/auth"
	"github.com/KolesnikovP/fitness_app/backend/internal/platform/httpx"
	"github.com/KolesnikovP/fitness_app/backend/internal/workout/store"
)

// ExerciseProgress is how the User has done at one Exercise over time: a
// point per finished Session with a Set of it, oldest first, worked out from
// Sets when read (ADR 0007). Weights are in Unit, the User's Unit preference.
type ExerciseProgress struct {
	Unit     string          `json:"unit"`
	Sessions []ProgressPoint `json:"sessions"`
}

// ProgressPoint is one finished Session's Sets of an Exercise: the best
// Estimated 1RM among them, the heaviest weight, and their Volume.
// PersonalRecord is whether the Session set a Personal record of any kind for
// the Exercise.
type ProgressPoint struct {
	SessionID      uuid.UUID `json:"sessionId"`
	FinishedAt     time.Time `json:"finishedAt"`
	Estimated1RM   float64   `json:"estimated1RM"`
	HeaviestWeight float64   `json:"heaviestWeight"`
	Volume         float64   `json:"volume"`
	PersonalRecord bool      `json:"personalRecord"`
}

// exerciseProgress serves the caller's progress at the {id} Exercise. Sets
// follow the Exercise they were done with (ADR 0006).
func (h handlers) exerciseProgress(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	caller, _ := auth.AccountID(ctx)
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeExerciseNotFound(w)
		return
	}
	names, err := h.exercises.ExerciseNames(ctx, caller, []uuid.UUID{id})
	if err != nil {
		httpx.WriteInternalError(w, r, err)
		return
	}
	if _, ok := names[id]; !ok {
		writeExerciseNotFound(w)
		return
	}
	sets, err := h.queries.ListFinishedSetsOfExercises(ctx, store.ListFinishedSetsOfExercisesParams{
		AccountID: caller, ExerciseIds: []uuid.UUID{id},
	})
	if err != nil {
		httpx.WriteInternalError(w, r, fmt.Errorf("list sets of exercise: %w", err))
		return
	}
	unit, err := h.profiles.UnitPreference(ctx, caller)
	if err != nil {
		httpx.WriteInternalError(w, r, err)
		return
	}

	records, _ := recordsBySession(sets)
	out := ExerciseProgress{Unit: unit, Sessions: []ProgressPoint{}}
	for start := 0; start < len(sets); {
		end := start
		for end < len(sets) && sets[end].SessionID == sets[start].SessionID {
			end++
		}
		var topE1RM, topKg float64
		logged := make([]loggedSet, 0, end-start)
		for _, s := range sets[start:end] {
			kg := kgOf(s.Weight, s.WeightUnit)
			topE1RM = max(topE1RM, estimated1RM(kg, s.Reps))
			topKg = max(topKg, kg)
			logged = append(logged, loggedSet{exerciseID: s.ExerciseID, weight: s.Weight, weightUnit: s.WeightUnit, reps: s.Reps})
		}
		out.Sessions = append(out.Sessions, ProgressPoint{
			SessionID:      sets[start].SessionID,
			FinishedAt:     sets[start].FinishedAt,
			Estimated1RM:   inUnit(topE1RM, unit),
			HeaviestWeight: inUnit(topKg, unit),
			Volume:         volumeOf(logged, unit),
			PersonalRecord: len(records[sets[start].SessionID]) > 0,
		})
		start = end
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}
