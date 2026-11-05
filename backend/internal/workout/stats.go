package workout

import (
	"cmp"
	"context"
	"fmt"
	"math"
	"net/http"
	"slices"
	"time"

	"github.com/google/uuid"

	"github.com/KolesnikovP/fitness_app/backend/internal/auth"
	"github.com/KolesnikovP/fitness_app/backend/internal/platform/httpx"
	"github.com/KolesnikovP/fitness_app/backend/internal/workout/store"
)

// Stats are worked out from a finished Session's Sets each time they're read,
// never stored (ADR 0007). Volume is the sum of weight × reps over its Sets,
// in VolumeUnit, the User's Unit preference; a Set logged in the other unit
// is converted, and a Set at weight 0 adds nothing. ExerciseCount is how many
// different Exercises it lists, and SetCount how many Sets were logged in it,
// at weight 0 too.
type Stats struct {
	DurationSeconds int64   `json:"durationSeconds"`
	Volume          float64 `json:"volume"`
	VolumeUnit      string  `json:"volumeUnit"`
	ExerciseCount   int     `json:"exerciseCount"`
	SetCount        int     `json:"setCount"`
}

// Totals are the stats of the Sessions finished in a time range, such as a
// week.
type Totals struct {
	SessionCount       int                `json:"sessionCount"`
	Volume             float64            `json:"volume"`
	VolumeUnit         string             `json:"volumeUnit"`
	SetsPerMuscleGroup []MuscleGroupCount `json:"setsPerMuscleGroup"`
}

// MuscleGroupCount is how many Sets trained a Muscle group.
type MuscleGroupCount struct {
	MuscleGroup string `json:"muscleGroup"`
	Sets        int    `json:"sets"`
}

// kgPerLb is the one fixed factor weights convert by (ADR 0007).
const kgPerLb = 0.45359237

// loggedSet is what stats need of a Set.
type loggedSet struct {
	exerciseID uuid.UUID
	weight     float64
	weightUnit string
	reps       int32
}

// volumeOf sums weight × reps over sets, in unit, to one decimal.
func volumeOf(sets []loggedSet, unit string) float64 {
	var kg float64
	for _, s := range sets {
		w := s.weight
		if s.weightUnit == "lb" {
			w *= kgPerLb
		}
		kg += w * float64(s.reps)
	}
	v := kg
	if unit == "lb" {
		v = kg / kgPerLb
	}
	return math.Round(v*10) / 10
}

func statsOf(startedAt, finishedAt time.Time, exerciseCount int, sets []loggedSet, unit string) Stats {
	return Stats{
		DurationSeconds: int64(finishedAt.Sub(startedAt).Seconds()),
		Volume:          volumeOf(sets, unit),
		VolumeUnit:      unit,
		ExerciseCount:   exerciseCount,
		SetCount:        len(sets),
	}
}

// setsOfSessions loads the sets logged in each of sessionIDs.
func (h handlers) setsOfSessions(ctx context.Context, sessionIDs []uuid.UUID) (map[uuid.UUID][]loggedSet, error) {
	rows, err := h.queries.ListSetsOfSessions(ctx, sessionIDs)
	if err != nil {
		return nil, fmt.Errorf("list sets of sessions: %w", err)
	}
	out := make(map[uuid.UUID][]loggedSet)
	for _, r := range rows {
		out[r.SessionID] = append(out[r.SessionID], loggedSet{
			exerciseID: r.ExerciseID, weight: r.Weight, weightUnit: r.WeightUnit, reps: r.Reps,
		})
	}
	return out, nil
}

// sessionStats works out a loaded Session's stats, or nil while it's in
// progress.
func (h handlers) sessionStats(ctx context.Context, caller uuid.UUID, session Session) (*Stats, error) {
	if session.FinishedAt == nil {
		return nil, nil
	}
	unit, err := h.profiles.UnitPreference(ctx, caller)
	if err != nil {
		return nil, err
	}
	var sets []loggedSet
	var exerciseIDs []uuid.UUID
	for _, e := range session.Exercises {
		if len(e.Sets) == 0 {
			exerciseIDs = append(exerciseIDs, e.ExerciseID)
		}
		for _, s := range e.Sets {
			sets = append(sets, loggedSet{exerciseID: s.ExerciseID, weight: s.Weight, weightUnit: s.WeightUnit, reps: s.Reps})
			exerciseIDs = append(exerciseIDs, s.ExerciseID)
		}
	}
	slices.SortFunc(exerciseIDs, func(a, b uuid.UUID) int { return cmp.Compare(a.String(), b.String()) })
	stats := statsOf(session.StartedAt, *session.FinishedAt, len(slices.Compact(exerciseIDs)), sets, unit)
	return &stats, nil
}

// get returns one of the caller's Sessions, with its stats once finished.
func (h handlers) get(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeSessionNotFound(w)
		return
	}
	h.writeSession(w, r, http.StatusOK, id)
}

// totals totals the caller's Sessions finished from ?from up to (not
// including) ?to, both RFC 3339. The client sends the bounds of its local
// week, so the server needs no time zone.
func (h handlers) totals(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	caller, _ := auth.AccountID(ctx)
	from, errFrom := time.Parse(time.RFC3339, r.URL.Query().Get("from"))
	to, errTo := time.Parse(time.RFC3339, r.URL.Query().Get("to"))
	if errFrom != nil || errTo != nil || !from.Before(to) {
		httpx.WriteError(w, http.StatusBadRequest, "invalid_range",
			"Send from and to as RFC 3339 times, from before to.")
		return
	}

	rows, err := h.queries.ListFinishedSessionsBetween(ctx, store.ListFinishedSessionsBetweenParams{
		AccountID: caller, FromTime: from, ToTime: to,
	})
	if err != nil {
		httpx.WriteInternalError(w, r, fmt.Errorf("list sessions in range: %w", err))
		return
	}
	ids := make([]uuid.UUID, len(rows))
	for i, row := range rows {
		ids[i] = row.ID
	}
	setsBySession, err := h.setsOfSessions(ctx, ids)
	if err != nil {
		httpx.WriteInternalError(w, r, err)
		return
	}
	var sets []loggedSet
	var exerciseIDs []uuid.UUID
	for _, id := range ids {
		for _, s := range setsBySession[id] {
			sets = append(sets, s)
			exerciseIDs = append(exerciseIDs, s.exerciseID)
		}
	}
	muscleGroups, err := h.exercises.ExerciseMuscleGroups(ctx, caller, exerciseIDs)
	if err != nil {
		httpx.WriteInternalError(w, r, err)
		return
	}
	unit, err := h.profiles.UnitPreference(ctx, caller)
	if err != nil {
		httpx.WriteInternalError(w, r, err)
		return
	}

	httpx.WriteJSON(w, http.StatusOK, Totals{
		SessionCount:       len(rows),
		Volume:             volumeOf(sets, unit),
		VolumeUnit:         unit,
		SetsPerMuscleGroup: setsPerMuscleGroup(sets, muscleGroups),
	})
}

// setsPerMuscleGroup counts sets by the Muscle group of the Exercise done,
// most sets first. Sets of an Exercise not in muscleGroups aren't counted.
func setsPerMuscleGroup(sets []loggedSet, muscleGroups map[uuid.UUID]string) []MuscleGroupCount {
	counts := make(map[string]int)
	for _, s := range sets {
		if group, ok := muscleGroups[s.exerciseID]; ok {
			counts[group]++
		}
	}
	out := make([]MuscleGroupCount, 0, len(counts))
	for group, n := range counts {
		out = append(out, MuscleGroupCount{MuscleGroup: group, Sets: n})
	}
	slices.SortFunc(out, func(a, b MuscleGroupCount) int {
		return cmp.Or(cmp.Compare(b.Sets, a.Sets), cmp.Compare(a.MuscleGroup, b.MuscleGroup))
	})
	return out
}
