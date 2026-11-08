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

// ExerciseRecords are the User's Bests for one Exercise, and its current Rep
// records: the heaviest Set at each rep count, fewest reps first.
type ExerciseRecords struct {
	Bests      Bests     `json:"bests"`
	RepRecords []BestSet `json:"repRecords"`
}

// Bests are the User's Bests for one Exercise over their finished Sessions,
// each null until there is one. Those by weight come only from Sets with
// weight, so an Exercise only ever done at weight 0 has MostReps alone.
type Bests struct {
	Estimated1RM   *Best `json:"estimated1RM"`
	HeaviestWeight *Best `json:"heaviestWeight"`
	SetVolume      *Best `json:"setVolume"`
	ExerciseVolume *Best `json:"exerciseVolume"`
	MostReps       *Best `json:"mostReps"`
}

// Best is the highest Value so far of one measure, first reached in SessionID,
// which finished at AchievedAt; an equal later value doesn't take it over.
// Value is in Unit, the User's Unit preference, or a number of reps, with no
// Unit. Set is the Set behind a measure of one Set.
type Best struct {
	Value      float64    `json:"value"`
	Unit       string     `json:"unit,omitempty"`
	SessionID  uuid.UUID  `json:"sessionId"`
	AchievedAt time.Time  `json:"achievedAt"`
	Set        *SetOfBest `json:"set,omitempty"`
}

// SetOfBest is the Set behind a Best, its weight in WeightUnit, the unit it
// was logged in.
type SetOfBest struct {
	SetID      uuid.UUID `json:"setId"`
	Weight     float64   `json:"weight"`
	WeightUnit string    `json:"weightUnit"`
	Reps       int32     `json:"reps"`
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

// best is the Set with the highest value seen of some measure: in kg, or a
// number of reps.
type best struct {
	set   store.ListFinishedSetsOfExercisesRow
	value float64
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
	for _, session := range bySession(sets) {
		// The Session's best Set of each kind, the first logged of equals.
		bestE1RM := make(map[uuid.UUID]best)
		bestReps := make(map[exerciseReps]best)
		for _, s := range session {
			if s.Weight <= 0 {
				continue
			}
			kg := kgOf(s.Weight, s.WeightUnit)
			if b, ok := bestE1RM[s.ExerciseID]; !ok || estimated1RM(kg, s.Reps) > b.value+beatsBy {
				bestE1RM[s.ExerciseID] = best{s, estimated1RM(kg, s.Reps)}
			}
			key := exerciseReps{s.ExerciseID, s.Reps}
			if b, ok := bestReps[key]; !ok || kg > b.value+beatsBy {
				bestReps[key] = best{s, kg}
			}
		}

		var hits []recordHit
		for id, b := range bestE1RM {
			if prior, ok := priorE1RM[id]; ok && b.value > prior+beatsBy {
				hits = append(hits, recordHit{b.set, kindEstimated1RM})
			}
		}
		for key, b := range bestReps {
			if prior, ok := priorReps[key]; ok && b.value > prior+beatsBy {
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
	}
	return out, tiers
}

// bySession splits sets, each Session's together, into each Session's, in
// the order they come.
func bySession(sets []store.ListFinishedSetsOfExercisesRow) [][]store.ListFinishedSetsOfExercisesRow {
	var out [][]store.ListFinishedSetsOfExercisesRow
	for start := 0; start < len(sets); {
		end := start
		for end < len(sets) && sets[end].SessionID == sets[start].SessionID {
			end++
		}
		out = append(out, sets[start:end])
		start = end
	}
	return out
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

// exerciseSets loads the caller's Sets of the {id} Exercise in their finished
// Sessions, in the order they were done, and the caller's Unit preference. It
// writes a 404 if the caller can't see the Exercise, or an error, and then
// returns false.
func (h handlers) exerciseSets(w http.ResponseWriter, r *http.Request) ([]store.ListFinishedSetsOfExercisesRow, string, bool) {
	ctx := r.Context()
	caller, _ := auth.AccountID(ctx)
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeExerciseNotFound(w)
		return nil, "", false
	}
	names, err := h.exercises.ExerciseNames(ctx, caller, []uuid.UUID{id})
	if err != nil {
		httpx.WriteInternalError(w, r, err)
		return nil, "", false
	}
	if _, ok := names[id]; !ok {
		writeExerciseNotFound(w)
		return nil, "", false
	}
	sets, err := h.queries.ListFinishedSetsOfExercises(ctx, store.ListFinishedSetsOfExercisesParams{
		AccountID: caller, ExerciseIds: []uuid.UUID{id},
	})
	if err != nil {
		httpx.WriteInternalError(w, r, fmt.Errorf("list sets of exercise: %w", err))
		return nil, "", false
	}
	unit, err := h.profiles.UnitPreference(ctx, caller)
	if err != nil {
		httpx.WriteInternalError(w, r, err)
		return nil, "", false
	}
	return sets, unit, true
}

// exerciseRecords serves the caller's current records for the {id} Exercise.
func (h handlers) exerciseRecords(w http.ResponseWriter, r *http.Request) {
	sets, unit, ok := h.exerciseSets(w, r)
	if !ok {
		return
	}

	byReps := make(map[int32]best)
	for _, s := range sets {
		if s.Weight <= 0 {
			continue
		}
		kg := kgOf(s.Weight, s.WeightUnit)
		if b, ok := byReps[s.Reps]; !ok || kg > b.value+beatsBy {
			byReps[s.Reps] = best{s, kg}
		}
	}
	out := ExerciseRecords{Bests: bestsOf(sets, unit), RepRecords: make([]BestSet, 0, len(byReps))}
	for _, b := range byReps {
		out.RepRecords = append(out.RepRecords, bestSetOf(b.set, unit))
	}
	slices.SortFunc(out.RepRecords, func(a, b BestSet) int { return cmp.Compare(a.Reps, b.Reps) })
	httpx.WriteJSON(w, http.StatusOK, out)
}

// bestsOf works out the Bests in sets, every Set of one Exercise in the order
// they were done, a Session's together, with weights in unit.
func bestsOf(sets []store.ListFinishedSetsOfExercisesRow, unit string) Bests {
	// Each top's value is in kg, but mostReps's, which is in reps. A Session's
	// measures take its first Set, for the Session and when it finished.
	var e1RM, heaviest, setVolume, exerciseVolume, mostReps *best
	higher := func(top *best, s store.ListFinishedSetsOfExercisesRow, value float64) *best {
		if top == nil || value > top.value+beatsBy {
			return &best{s, value}
		}
		return top
	}
	for _, session := range bySession(sets) {
		var volumeKg float64
		var reps int32
		for _, s := range session {
			reps += s.Reps
			if s.Weight <= 0 {
				continue
			}
			kg := kgOf(s.Weight, s.WeightUnit)
			e1RM = higher(e1RM, s, estimated1RM(kg, s.Reps))
			heaviest = higher(heaviest, s, kg)
			setVolume = higher(setVolume, s, kg*float64(s.Reps))
			volumeKg += kg * float64(s.Reps)
		}
		if volumeKg > 0 {
			exerciseVolume = higher(exerciseVolume, session[0], volumeKg)
		}
		mostReps = higher(mostReps, session[0], float64(reps))
	}

	ofSet := func(b *best) *Best {
		if b == nil {
			return nil
		}
		out := ofSession(b, unit)
		out.Set = &SetOfBest{SetID: b.set.ID, Weight: b.set.Weight, WeightUnit: b.set.WeightUnit, Reps: b.set.Reps}
		return out
	}
	out := Bests{
		Estimated1RM:   ofSet(e1RM),
		HeaviestWeight: ofSet(heaviest),
		SetVolume:      ofSet(setVolume),
		ExerciseVolume: ofSession(exerciseVolume, unit),
	}
	if mostReps != nil {
		out.MostReps = &Best{Value: mostReps.value, SessionID: mostReps.set.SessionID, AchievedAt: mostReps.set.FinishedAt}
	}
	return out
}

// ofSession is b, a top in kg, as a Best in unit with no Set, or nil.
func ofSession(b *best, unit string) *Best {
	if b == nil {
		return nil
	}
	return &Best{Value: inUnit(b.value, unit), Unit: unit, SessionID: b.set.SessionID, AchievedAt: b.set.FinishedAt}
}

// bestSetOf is s as a BestSet, its Estimated 1RM in unit.
func bestSetOf(s store.ListFinishedSetsOfExercisesRow, unit string) BestSet {
	return BestSet{
		SessionID: s.SessionID, SetID: s.ID, AchievedAt: s.FinishedAt,
		Weight: s.Weight, WeightUnit: s.WeightUnit, Reps: s.Reps,
		Estimated1RM:     inUnit(estimated1RM(kgOf(s.Weight, s.WeightUnit), s.Reps), unit),
		Estimated1RMUnit: unit,
	}
}

// bestEstimated1RM is the Set of sets with the best Estimated 1RM, the first
// done of equals, or nil if none has weight.
func bestEstimated1RM(sets []store.ListFinishedSetsOfExercisesRow, unit string) *BestSet {
	var top *best
	for _, s := range sets {
		if s.Weight <= 0 {
			continue
		}
		if e1RM := estimated1RM(kgOf(s.Weight, s.WeightUnit), s.Reps); top == nil || e1RM > top.value+beatsBy {
			top = &best{s, e1RM}
		}
	}
	if top == nil {
		return nil
	}
	b := bestSetOf(top.set, unit)
	return &b
}

// ExerciseBest is an Exercise's best Estimated 1RM ever, as Progress on the
// Profile shows it. It isn't a Personal record: a first Session sets none,
// but its best still shows here.
type ExerciseBest struct {
	ExerciseID uuid.UUID `json:"exerciseId"`
	Name       string    `json:"name"`
	Best       BestSet   `json:"best"`
}

type exerciseBestsResponse struct {
	Exercises []ExerciseBest `json:"exercises"`
}

// exerciseBests serves the best Estimated 1RM of every Exercise the caller
// has done with weight in a finished Session, by Exercise name.
func (h handlers) exerciseBests(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	caller, _ := auth.AccountID(ctx)
	ids, err := h.queries.ListFinishedExerciseIDs(ctx, caller)
	if err != nil {
		httpx.WriteInternalError(w, r, fmt.Errorf("list finished exercises: %w", err))
		return
	}
	sets, err := h.queries.ListFinishedSetsOfExercises(ctx, store.ListFinishedSetsOfExercisesParams{
		AccountID: caller, ExerciseIds: ids,
	})
	if err != nil {
		httpx.WriteInternalError(w, r, fmt.Errorf("list sets of exercises: %w", err))
		return
	}
	names, err := h.exercises.ExerciseNames(ctx, caller, ids)
	if err != nil {
		httpx.WriteInternalError(w, r, err)
		return
	}
	unit, err := h.profiles.UnitPreference(ctx, caller)
	if err != nil {
		httpx.WriteInternalError(w, r, err)
		return
	}

	byExercise := make(map[uuid.UUID][]store.ListFinishedSetsOfExercisesRow)
	for _, s := range sets {
		byExercise[s.ExerciseID] = append(byExercise[s.ExerciseID], s)
	}
	out := exerciseBestsResponse{Exercises: []ExerciseBest{}}
	for id, sets := range byExercise {
		name, visible := names[id]
		top := bestEstimated1RM(sets, unit)
		if !visible || top == nil {
			continue
		}
		out.Exercises = append(out.Exercises, ExerciseBest{ExerciseID: id, Name: name, Best: *top})
	}
	slices.SortFunc(out.Exercises, func(a, b ExerciseBest) int {
		return cmp.Or(cmp.Compare(a.Name, b.Name), cmp.Compare(a.ExerciseID.String(), b.ExerciseID.String()))
	})
	httpx.WriteJSON(w, http.StatusOK, out)
}
