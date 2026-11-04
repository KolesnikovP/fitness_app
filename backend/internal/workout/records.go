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

// Personal records are worked out from the User's Sets each time they're
// read, never stored (ADR 0007), so correcting a Set adds or removes them.
// They follow the Exercise a Set records (ADR 0006), and compare weights in kg,
// converting lb by the one fixed factor, so the unit a Set was logged in
// never makes or hides one.
//
// A finished Session sets a record of a kind for an Exercise with its best Set
// of that kind, when that beats every Set before it: those of earlier finished
// Sessions, and so those earlier in the same Session too. There must be an
// earlier Session's Set to beat, so the first Session of an Exercise sets
// none, nor its first Session at a rep count a rep record. Sets at weight 0 set
// none. A Session in progress has the records its Sets set so far, so the
// User hears of one as soon as they log it.
const (
	// kindEstimated1RM is a Set whose Estimated 1RM beats every earlier one.
	kindEstimated1RM = "estimated1RM"
	// kindReps is a rep record: a Set whose weight beats every earlier Set at
	// the same reps.
	kindReps = "reps"
)

// PersonalRecord is a Set of a Session that set a record of Kind. Weight is
// in WeightUnit, the unit it was logged in; Estimated1RM is in
// Estimated1RMUnit, the User's Unit preference.
type PersonalRecord struct {
	Kind             string    `json:"kind"`
	SetID            uuid.UUID `json:"setId"`
	ExerciseID       uuid.UUID `json:"exerciseId"`
	Name             string    `json:"name"`
	Weight           float64   `json:"weight"`
	WeightUnit       string    `json:"weightUnit"`
	Reps             int32     `json:"reps"`
	Estimated1RM     float64   `json:"estimated1RM"`
	Estimated1RMUnit string    `json:"estimated1RMUnit"`
}

// ExerciseRecords are the User's current records for one Exercise: the Set
// with the best Estimated 1RM, null before any Set with weight, and the
// heaviest Set at each rep count, fewest reps first.
type ExerciseRecords struct {
	Estimated1RM *BestSet  `json:"estimated1RM"`
	RepRecords   []BestSet `json:"repRecords"`
}

// BestSet is a Set holding a current record, with the Session it was set in
// and when that finished. Weights are as on PersonalRecord.
type BestSet struct {
	SessionID        uuid.UUID `json:"sessionId"`
	SetID            uuid.UUID `json:"setId"`
	AchievedAt       time.Time `json:"achievedAt"`
	Weight           float64   `json:"weight"`
	WeightUnit       string    `json:"weightUnit"`
	Reps             int32     `json:"reps"`
	Estimated1RM     float64   `json:"estimated1RM"`
	Estimated1RMUnit string    `json:"estimated1RMUnit"`
}

// A Record tier is how close a Set came to the User's best Estimated 1RM for
// its Exercise before its Session: the highest among that Exercise's Sets with
// weight in the User's finished Sessions before it (every finished Session,
// while it is in progress). A Set holding a Personal record of either kind is
// gold; any other Set with weight is silver at silverAt of that best or more,
// which takes in Sets above it that aren't the Session's record, and bronze at
// bronzeAt. With no such best, a Set has no tier but gold.
type RecordTier string

const (
	tierGold   RecordTier = "gold"
	tierSilver RecordTier = "silver"
	tierBronze RecordTier = "bronze"
)

const (
	silverAt = 0.975
	bronzeAt = 0.95
)

// beatsBy is how much heavier, in kg, a Set must be to beat another, so float
// noise from converting units never makes a record of an equal weight.
const beatsBy = 1e-6

func kgOf(weight float64, unit string) float64 {
	if unit == "lb" {
		return weight * kgPerLb
	}
	return weight
}

// estimated1RM is Epley's estimate of the weight one rep could be done at:
// weight × (1 + reps / 30), or the weight itself for a 1-rep Set.
func estimated1RM(weight float64, reps int32) float64 {
	if reps == 1 {
		return weight
	}
	return weight * (1 + float64(reps)/30)
}

// inUnit converts kg to unit, to one decimal.
func inUnit(kg float64, unit string) float64 {
	if unit == "lb" {
		kg /= kgPerLb
	}
	return math.Round(kg*10) / 10
}

type exerciseReps struct {
	exerciseID uuid.UUID
	reps       int32
}

// recordHit is a Set that set a record of kind.
type recordHit struct {
	set  store.ListFinishedSetsOfExercisesRow
	kind string
}

// best is the heaviest Set seen of something, in kg by some measure.
type best struct {
	set store.ListFinishedSetsOfExercisesRow
	kg  float64
}

// recordsBySession finds the records each Session set, given every Set of the
// Exercises concerned in the order they were done, a Session's together. Each
// Session's are in the order its Sets were logged. It also finds each Set's
// Record tier, keyed by Set; a Set with none is left out.
func recordsBySession(sets []store.ListFinishedSetsOfExercisesRow) (map[uuid.UUID][]recordHit, map[uuid.UUID]RecordTier) {
	out := make(map[uuid.UUID][]recordHit)
	tiers := make(map[uuid.UUID]RecordTier)
	priorE1RM := make(map[uuid.UUID]float64)
	priorReps := make(map[exerciseReps]float64)
	for start := 0; start < len(sets); {
		end := start
		for end < len(sets) && sets[end].SessionID == sets[start].SessionID {
			end++
		}
		session := sets[start:end]

		// The Session's best Set of each kind, the first logged of equals.
		bestE1RM := make(map[uuid.UUID]best)
		bestReps := make(map[exerciseReps]best)
		for _, s := range session {
			if s.Weight <= 0 {
				continue
			}
			kg := kgOf(s.Weight, s.WeightUnit)
			if b, ok := bestE1RM[s.ExerciseID]; !ok || estimated1RM(kg, s.Reps) > b.kg+beatsBy {
				bestE1RM[s.ExerciseID] = best{s, estimated1RM(kg, s.Reps)}
			}
			key := exerciseReps{s.ExerciseID, s.Reps}
			if b, ok := bestReps[key]; !ok || kg > b.kg+beatsBy {
				bestReps[key] = best{s, kg}
			}
		}

		var hits []recordHit
		for id, b := range bestE1RM {
			if prior, ok := priorE1RM[id]; ok && b.kg > prior+beatsBy {
				hits = append(hits, recordHit{b.set, kindEstimated1RM})
			}
		}
		for key, b := range bestReps {
			if prior, ok := priorReps[key]; ok && b.kg > prior+beatsBy {
				hits = append(hits, recordHit{b.set, kindReps})
			}
		}
		order := make(map[uuid.UUID]int, len(session))
		for i, s := range session {
			order[s.ID] = i
		}
		slices.SortFunc(hits, func(a, b recordHit) int {
			return cmp.Or(cmp.Compare(order[a.set.ID], order[b.set.ID]), cmp.Compare(a.kind, b.kind))
		})
		if len(hits) > 0 {
			out[session[0].SessionID] = hits
		}

		for _, hit := range hits {
			tiers[hit.set.ID] = tierGold
		}
		for _, s := range session {
			prior := priorE1RM[s.ExerciseID]
			if s.Weight <= 0 || prior <= 0 || tiers[s.ID] == tierGold {
				continue
			}
			switch e1RM := estimated1RM(kgOf(s.Weight, s.WeightUnit), s.Reps); {
			case e1RM >= silverAt*prior-beatsBy:
				tiers[s.ID] = tierSilver
			case e1RM >= bronzeAt*prior-beatsBy:
				tiers[s.ID] = tierBronze
			}
		}

		for _, s := range session {
			kg := kgOf(s.Weight, s.WeightUnit)
			priorE1RM[s.ExerciseID] = max(priorE1RM[s.ExerciseID], estimated1RM(kg, s.Reps))
			key := exerciseReps{s.ExerciseID, s.Reps}
			priorReps[key] = max(priorReps[key], kg)
		}
		start = end
	}
	return out, tiers
}

// personalRecords works out the records each of the caller's finished
// Sessions set in exerciseIDs, keyed by Session, with Estimated 1RMs in unit,
// and the Record tier of each of their Sets that has one, keyed by Set.
// inProgress, the Sets of the Session in progress if any, come after them all.
func (h handlers) personalRecords(ctx context.Context, caller uuid.UUID, exerciseIDs []uuid.UUID,
	unit string, inProgress []store.ListFinishedSetsOfExercisesRow) (map[uuid.UUID][]PersonalRecord, map[uuid.UUID]RecordTier, error) {
	sets, err := h.queries.ListFinishedSetsOfExercises(ctx, store.ListFinishedSetsOfExercisesParams{
		AccountID: caller, ExerciseIds: exerciseIDs,
	})
	if err != nil {
		return nil, nil, fmt.Errorf("list sets of exercises: %w", err)
	}
	hits, tiers := recordsBySession(append(sets, inProgress...))
	var ids []uuid.UUID
	for _, list := range hits {
		for _, hit := range list {
			ids = append(ids, hit.set.ExerciseID)
		}
	}
	names, err := h.exercises.ExerciseNames(ctx, caller, ids)
	if err != nil {
		return nil, nil, err
	}
	out := make(map[uuid.UUID][]PersonalRecord, len(hits))
	for sessionID, list := range hits {
		for _, hit := range list {
			s := hit.set
			out[sessionID] = append(out[sessionID], PersonalRecord{
				Kind: hit.kind, SetID: s.ID, ExerciseID: s.ExerciseID, Name: names[s.ExerciseID],
				Weight: s.Weight, WeightUnit: s.WeightUnit, Reps: s.Reps,
				Estimated1RM:     inUnit(estimated1RM(kgOf(s.Weight, s.WeightUnit), s.Reps), unit),
				Estimated1RMUnit: unit,
			})
		}
	}
	return out, tiers, nil
}

// exerciseRecords serves the caller's current records for the {id} Exercise.
func (h handlers) exerciseRecords(w http.ResponseWriter, r *http.Request) {
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

	bestOf := func(s store.ListFinishedSetsOfExercisesRow) BestSet {
		return BestSet{
			SessionID: s.SessionID, SetID: s.ID, AchievedAt: s.FinishedAt,
			Weight: s.Weight, WeightUnit: s.WeightUnit, Reps: s.Reps,
			Estimated1RM:     inUnit(estimated1RM(kgOf(s.Weight, s.WeightUnit), s.Reps), unit),
			Estimated1RMUnit: unit,
		}
	}
	var topE1RM *best
	byReps := make(map[int32]best)
	for _, s := range sets {
		if s.Weight <= 0 {
			continue
		}
		kg := kgOf(s.Weight, s.WeightUnit)
		if topE1RM == nil || estimated1RM(kg, s.Reps) > topE1RM.kg+beatsBy {
			topE1RM = &best{s, estimated1RM(kg, s.Reps)}
		}
		if b, ok := byReps[s.Reps]; !ok || kg > b.kg+beatsBy {
			byReps[s.Reps] = best{s, kg}
		}
	}
	out := ExerciseRecords{RepRecords: make([]BestSet, 0, len(byReps))}
	if topE1RM != nil {
		b := bestOf(topE1RM.set)
		out.Estimated1RM = &b
	}
	for _, b := range byReps {
		out.RepRecords = append(out.RepRecords, bestOf(b.set))
	}
	slices.SortFunc(out.RepRecords, func(a, b BestSet) int { return cmp.Compare(a.Reps, b.Reps) })
	httpx.WriteJSON(w, http.StatusOK, out)
}
