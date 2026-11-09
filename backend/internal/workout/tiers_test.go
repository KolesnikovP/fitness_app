package workout_test

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/KolesnikovP/fitness_app/backend/internal/testutil"
)

func TestRecordTiers(t *testing.T) {
	srv := testutil.NewServer(t)

	t.Run("the worked example: gold beats the best, silver is within 2.5%, bronze within 5%", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		logWorkout(t, srv, token, "Bench Press", set{100, "kg", 5}) // Estimated 1RM 116.7 kg.
		today := logWorkout(t, srv, token, "Bench Press",
			set{105, "kg", 5}, set{100, "kg", 5}, set{100, "kg", 4}, set{95, "kg", 5}, set{100, "kg", 3})

		if got, want := sessionTiers(t, srv, token, today),
			"[105kg×5 gold 100kg×5 silver 100kg×4 bronze 95kg×5 bronze 100kg×3 none]"; got != want {
			t.Errorf("tiers = %s, want %s", got, want)
		}
	})

	t.Run("a warm-up has no tier and doesn't raise the best", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		before := startSession(t, srv, token)
		bench := addExercise(t, srv, token, before, "Bench Press")
		logTypedSet(t, srv, token, before, bench, 100, 5, "normal")
		logTypedSet(t, srv, token, before, bench, 130, 5, "warmup")
		finishSession(t, srv, token, before)
		today := startSession(t, srv, token)
		bench = addExercise(t, srv, token, today, "Bench Press")
		logTypedSet(t, srv, token, today, bench, 110, 5, "warmup")
		logTypedSet(t, srv, token, today, bench, 100, 5, "failure")

		if got, want := sessionTiers(t, srv, token, today), "[110kg×5 none 100kg×5 silver]"; got != want {
			t.Errorf("tiers in progress = %s, want %s", got, want)
		}
		finishSession(t, srv, token, today)
		if got, want := sessionTiers(t, srv, token, today), "[110kg×5 none 100kg×5 silver]"; got != want {
			t.Errorf("tiers once finished = %s, want %s", got, want)
		}
	})

	t.Run("a session in progress has its tiers as its sets are logged", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		logWorkout(t, srv, token, "Bench Press", set{100, "kg", 5})
		id := startSession(t, srv, token)
		e := addExercise(t, srv, token, id, "Bench Press")

		logSetIn(t, srv, token, id, e, 100, "kg", 4)
		first := sessionTiers(t, srv, token, id)
		logSetIn(t, srv, token, id, e, 105, "kg", 5)
		logSetIn(t, srv, token, id, e, 100, "kg", 3)
		later := sessionTiers(t, srv, token, id)

		if want := "[100kg×4 bronze]"; first != want {
			t.Errorf("tiers after one set = %s, want %s", first, want)
		}
		if want := "[100kg×4 bronze 105kg×5 gold 100kg×3 none]"; later != want {
			t.Errorf("tiers after three sets = %s, want %s", later, want)
		}
	})

	t.Run("a set above the old best that isn't the session's record is silver", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		logWorkout(t, srv, token, "Bench Press", set{100, "kg", 5})
		today := logWorkout(t, srv, token, "Bench Press", set{102.5, "kg", 5}, set{105, "kg", 5})

		if got, want := sessionTiers(t, srv, token, today), "[102.5kg×5 silver 105kg×5 gold]"; got != want {
			t.Errorf("tiers = %s, want %s", got, want)
		}
	})

	t.Run("a rep record is gold, though its Estimated 1RM is short of the best", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		logWorkout(t, srv, token, "Deadlift", set{200, "kg", 1}, set{140, "kg", 8})
		// 150 × 8 is a 190 kg Estimated 1RM: 95% of 200, but the heaviest 8 yet.
		later := logWorkout(t, srv, token, "Deadlift", set{150, "kg", 8})

		if got, want := sessionTiers(t, srv, token, later), "[150kg×8 gold]"; got != want {
			t.Errorf("tiers = %s, want %s", got, want)
		}
	})

	t.Run("an exercise's first session has no tiers", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		first := logWorkout(t, srv, token, "Bench Press", set{100, "kg", 5}, set{100, "kg", 5}, set{97.5, "kg", 5})

		if got, want := sessionTiers(t, srv, token, first), "[100kg×5 none 100kg×5 none 97.5kg×5 none]"; got != want {
			t.Errorf("tiers = %s, want %s", got, want)
		}
	})

	t.Run("sets at weight 0 have none", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		logWorkout(t, srv, token, "Pull-up", set{0, "kg", 10}, set{10, "kg", 5})
		again := logWorkout(t, srv, token, "Pull-up", set{0, "kg", 12}, set{10, "kg", 5})

		if got, want := sessionTiers(t, srv, token, again), "[0kg×12 none 10kg×5 silver]"; got != want {
			t.Errorf("tiers = %s, want %s", got, want)
		}
	})

	t.Run("with only weight 0 before, a record is gold and no other set is tiered", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		logWorkout(t, srv, token, "Pull-up", set{0, "kg", 10})
		later := logWorkout(t, srv, token, "Pull-up", set{0, "kg", 10}, set{10, "kg", 5}, set{5, "kg", 5})

		if got, want := sessionTiers(t, srv, token, later), "[0kg×10 none 10kg×5 gold 5kg×5 none]"; got != want {
			t.Errorf("tiers = %s, want %s", got, want)
		}
	})

	t.Run("compares kg and lb by one fixed factor", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		logWorkout(t, srv, token, "Back Squat", set{100, "kg", 5})
		// 220 lb is 99.79 kg, 210 lb is 95.25 kg, 205 lb is 92.99 kg.
		today := logWorkout(t, srv, token, "Back Squat", set{220, "lb", 5}, set{210, "lb", 5}, set{205, "lb", 5})

		if got, want := sessionTiers(t, srv, token, today), "[220lb×5 silver 210lb×5 bronze 205lb×5 none]"; got != want {
			t.Errorf("tiers = %s, want %s", got, want)
		}
	})

	t.Run("a swapped set is measured against the exercise swapped to", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		logWorkout(t, srv, token, "Bench Press", set{40, "kg", 10})
		logWorkout(t, srv, token, "Dumbbell Bench Press", set{30, "kg", 10})
		routine := createRoutine(t, srv, token, map[string]any{
			"name": "Push day",
			"slots": []map[string]any{{
				"exerciseId": exerciseID(t, srv, token, "Bench Press"), "targetSets": 1, "targetReps": 10,
				"targetWeight": 0, "weightUnit": "kg",
				"substituteIds": []string{exerciseID(t, srv, token, "Dumbbell Bench Press")},
			}},
		})
		started := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions", token, map[string]any{"routineId": routine})
		id, e := started.Body["id"].(string), sessionExercises(t, started)[0]["id"].(string)
		logSetIn(t, srv, token, id, e, 38.5, "kg", 10) // A Bench Press set: 96.25% of its best.
		swapped := testutil.Do(t, srv, http.MethodPatch, "/workouts/sessions/"+id+"/exercises/"+e, token,
			map[string]any{"exerciseId": exerciseID(t, srv, token, "Dumbbell Bench Press")})
		if swapped.Status != http.StatusOK {
			t.Fatalf("swap: status %d, body %v", swapped.Status, swapped.Body)
		}
		logSetIn(t, srv, token, id, e, 30, "kg", 10) // Ties the Dumbbell Bench Press best; 75% of the Bench Press one.
		finishSession(t, srv, token, id)

		if got, want := sessionTiers(t, srv, token, id), "[38.5kg×10 bronze 30kg×10 silver]"; got != want {
			t.Errorf("tiers = %s, want %s", got, want)
		}
	})

	t.Run("correcting an earlier set changes a later set's tier", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		first := startSession(t, srv, token)
		typo := logOneSet(t, srv, token, first) // 100 kg × 5
		finishSession(t, srv, token, first)
		later := logWorkout(t, srv, token, "Bench Press", set{95, "kg", 5})
		if got, want := sessionTiers(t, srv, token, later), "[95kg×5 bronze]"; got != want {
			t.Fatalf("tiers = %s, want %s before the correction", got, want)
		}

		testutil.Pool(t).Exec(t.Context(), "UPDATE session_sets SET weight = 96 WHERE id = $1", typo)

		if got, want := sessionTiers(t, srv, token, later), "[95kg×5 silver]"; got != want {
			t.Errorf("tiers = %s, want %s", got, want)
		}
	})

	t.Run("a later record doesn't change an earlier session's tiers", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		logWorkout(t, srv, token, "Bench Press", set{100, "kg", 5})
		earlier := logWorkout(t, srv, token, "Bench Press", set{100, "kg", 5}, set{95, "kg", 5})
		logWorkout(t, srv, token, "Bench Press", set{120, "kg", 5})

		if got, want := sessionTiers(t, srv, token, earlier), "[100kg×5 silver 95kg×5 bronze]"; got != want {
			t.Errorf("tiers = %s, want %s", got, want)
		}
	})
}

// sessionTiers returns the Record tier of each of a session's sets, in the
// order of its exercises and then as logged, each as
// "<weight><unit>×<reps> <tier>", with "none" for a null tier.
func sessionTiers(t *testing.T, srv *httptest.Server, token, sessionID string) string {
	t.Helper()
	res := testutil.Do(t, srv, http.MethodGet, "/workouts/sessions/"+sessionID, token, nil)
	var out []string
	for _, e := range sessionExercises(t, res) {
		for _, s := range objects(t, e, "sets") {
			tier, present := s["recordTier"]
			if !present {
				t.Fatalf("set %v has no recordTier", s)
			}
			if tier == nil {
				tier = "none"
			}
			out = append(out, fmt.Sprintf("%v%v×%v %v", s["weight"], s["weightUnit"], s["reps"], tier))
		}
	}
	return fmt.Sprint(out)
}
