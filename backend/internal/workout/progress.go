package workout

import (
	"net/http"
	"time"

	"github.com/google/uuid"

	"github.com/KolesnikovP/fitness_app/backend/internal/platform/httpx"
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
	sets, unit, ok := h.exerciseSets(w, r)
	if !ok {
		return
	}
	// Only which Sessions set a record matters here, not each Set's tier.
	records, _ := recordsBySession(sets)
	out := ExerciseProgress{Unit: unit, Sessions: []ProgressPoint{}}
	for _, session := range bySession(sets) {
		var topEstimated1RM, heaviestKg float64
		logged := make([]loggedSet, 0, len(session))
		for _, s := range session {
			kg := kgOf(s.Weight, s.WeightUnit)
			topEstimated1RM = max(topEstimated1RM, estimated1RM(kg, s.Reps))
			heaviestKg = max(heaviestKg, kg)
			logged = append(logged, loggedSet{exerciseID: s.ExerciseID, weight: s.Weight, weightUnit: s.WeightUnit, reps: s.Reps})
		}
		out.Sessions = append(out.Sessions, ProgressPoint{
			SessionID:      session[0].SessionID,
			FinishedAt:     session[0].FinishedAt,
			Estimated1RM:   inUnit(topEstimated1RM, unit),
			HeaviestWeight: inUnit(heaviestKg, unit),
			Volume:         volumeOf(logged, unit),
			PersonalRecord: len(records[session[0].SessionID]) > 0,
		})
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}
