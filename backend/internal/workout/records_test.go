package workout_test

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/KolesnikovP/fitness_app/backend/internal/testutil"
)

func TestPersonalRecords(t *testing.T) {
	srv := testutil.NewServer(t)

	t.Run("a session that beats every earlier set has a record, one that doesn't has none", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		logWorkout(t, srv, token, "Bench Press", set{100, "kg", 5})
		beats := logWorkout(t, srv, token, "Bench Press", set{60, "kg", 5}, set{105, "kg", 5}, set{102.5, "kg", 5})
		short := logWorkout(t, srv, token, "Bench Press", set{100, "kg", 5}, set{104, "kg", 5})

		got := sessionRecords(t, srv, token, beats)
		if want := "[Bench Press estimated1RM 105kg×5 Bench Press reps 105kg×5]"; got != want {
			t.Errorf("records = %s, want %s", got, want)
		}
		if got := sessionRecords(t, srv, token, short); got != "[]" {
			t.Errorf("records = %s, want none", got)
		}
	})

	t.Run("the first-ever session of an exercise sets none, however its sets climb", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		first := logWorkout(t, srv, token, "Bench Press", set{60, "kg", 5}, set{80, "kg", 5}, set{100, "kg", 5})

		if got := sessionRecords(t, srv, token, first); got != "[]" {
			t.Errorf("records = %s, want none", got)
		}
	})

	t.Run("sets at weight 0 set none", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		logWorkout(t, srv, token, "Pull-up", set{0, "kg", 8})
		again := logWorkout(t, srv, token, "Pull-up", set{0, "kg", 12})

		if got := sessionRecords(t, srv, token, again); got != "[]" {
			t.Errorf("records = %s, want none", got)
		}
	})

	t.Run("compares kg and lb by one fixed factor", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		logWorkout(t, srv, token, "Back Squat", set{100, "kg", 5})
		lighter := logWorkout(t, srv, token, "Back Squat", set{220, "lb", 5}) // 99.79 kg
		same := logWorkout(t, srv, token, "Back Squat", set{100, "kg", 5})    // Ties, still 100 kg.
		heavier := logWorkout(t, srv, token, "Back Squat", set{225, "lb", 5}) // 102.06 kg

		for _, id := range []string{lighter, same} {
			if got := sessionRecords(t, srv, token, id); got != "[]" {
				t.Errorf("records = %s, want none", got)
			}
		}
		if got, want := sessionRecords(t, srv, token, heavier),
			"[Back Squat estimated1RM 225lb×5 Back Squat reps 225lb×5]"; got != want {
			t.Errorf("records = %s, want %s", got, want)
		}
	})

	t.Run("a rep record beats the heaviest earlier set at its reps, without beating the Estimated 1RM", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		logWorkout(t, srv, token, "Deadlift", set{200, "kg", 1}, set{140, "kg", 8})
		later := logWorkout(t, srv, token, "Deadlift", set{150, "kg", 8}, set{100, "kg", 12})

		// 150 × 8 is a 190 kg Estimated 1RM, short of 200; 12 reps is new.
		if got, want := sessionRecords(t, srv, token, later), "[Deadlift reps 150kg×8]"; got != want {
			t.Errorf("records = %s, want %s", got, want)
		}
	})

	t.Run("a swapped set counts for the exercise swapped to", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		logWorkout(t, srv, token, "Bench Press", set{30, "kg", 10})
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
		swapped := testutil.Do(t, srv, http.MethodPatch, "/workouts/sessions/"+id+"/exercises/"+e, token,
			map[string]any{"exerciseId": exerciseID(t, srv, token, "Dumbbell Bench Press")})
		if swapped.Status != http.StatusOK {
			t.Fatalf("swap: status %d, body %v", swapped.Status, swapped.Body)
		}
		logSetIn(t, srv, token, id, e, 35, "kg", 10) // Beats both, but is a Dumbbell Bench Press set.
		finishSession(t, srv, token, id)

		if got, want := sessionRecords(t, srv, token, id),
			"[Dumbbell Bench Press estimated1RM 35kg×10 Dumbbell Bench Press reps 35kg×10]"; got != want {
			t.Errorf("records = %s, want %s", got, want)
		}
	})

	t.Run("correcting an earlier set adds or removes later records", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		first := startSession(t, srv, token)
		typo := logOneSet(t, srv, token, first) // 100 kg × 5
		finishSession(t, srv, token, first)
		later := logWorkout(t, srv, token, "Bench Press", set{90, "kg", 5})
		if got := sessionRecords(t, srv, token, later); got != "[]" {
			t.Fatalf("records = %s, want none before the correction", got)
		}

		testutil.Pool(t).Exec(t.Context(), "UPDATE session_sets SET weight = 80 WHERE id = $1", typo)

		if got, want := sessionRecords(t, srv, token, later),
			"[Bench Press estimated1RM 90kg×5 Bench Press reps 90kg×5]"; got != want {
			t.Errorf("records = %s, want %s", got, want)
		}
	})

	t.Run("lists each session's records in the history", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		logWorkout(t, srv, token, "Bench Press", set{100, "kg", 5})
		logWorkout(t, srv, token, "Bench Press", set{100, "kg", 6})

		sessions := objects(t, testutil.Do(t, srv, http.MethodGet, "/workouts/sessions", token, nil).Body, "sessions")

		if got, want := describeRecords(objects(t, sessions[0], "personalRecords")),
			"[Bench Press estimated1RM 100kg×6]"; got != want {
			t.Errorf("newest records = %s, want %s", got, want)
		}
		if got := describeRecords(objects(t, sessions[1], "personalRecords")); got != "[]" {
			t.Errorf("first records = %s, want none", got)
		}
	})

	t.Run("an exercise's current records are its best Estimated 1RM and heaviest set at each rep count", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		setUnitPreference(t, srv, token, "kg")
		logWorkout(t, srv, token, "Bench Press", set{100, "kg", 5}, set{0, "kg", 20})
		best := logWorkout(t, srv, token, "Bench Press", set{240, "lb", 3}, set{90, "kg", 5}, set{110, "kg", 1})
		inProgress := startSession(t, srv, token)
		logSetIn(t, srv, token, inProgress, addExercise(t, srv, token, inProgress, "Bench Press"), 200, "kg", 1)

		res := testutil.Do(t, srv, http.MethodGet,
			"/workouts/exercises/"+exerciseID(t, srv, token, "Bench Press")+"/records", token, nil)

		if res.Status != http.StatusOK {
			t.Fatalf("status = %d, want 200; body %v", res.Status, res.Body)
		}
		top, _ := res.Body["estimated1RM"].(map[string]any)
		// 240 lb × 3 is 108.86 kg, so 119.7 kg estimated; 100 × 5 is 116.7.
		if top["weight"] != 240.0 || top["weightUnit"] != "lb" || top["reps"] != 3.0 ||
			top["estimated1RM"] != 119.7 || top["estimated1RMUnit"] != "kg" || top["sessionId"] != best {
			t.Errorf("estimated1RM = %v, want 240 lb × 3, 119.7 kg, from the second session", top)
		}
		if got, want := describeRecords(objects(t, res.Body, "repRecords")),
			"[<nil> <nil> 110kg×1 <nil> <nil> 240lb×3 <nil> <nil> 100kg×5]"; got != want {
			t.Errorf("repRecords = %s, want %s", got, want)
		}
	})

	t.Run("an exercise with no sets has no records, and one the caller can't see is not found", func(t *testing.T) {
		_, _, owner := testutil.SignUp(t, srv)
		custom := createCustomExercise(t, srv, owner, "Belt Squat")
		_, _, token := testutil.SignUp(t, srv)

		none := testutil.Do(t, srv, http.MethodGet,
			"/workouts/exercises/"+exerciseID(t, srv, token, "Bench Press")+"/records", token, nil)
		hidden := testutil.Do(t, srv, http.MethodGet, "/workouts/exercises/"+custom+"/records", token, nil)

		if none.Status != http.StatusOK || none.Body["estimated1RM"] != nil || len(objects(t, none.Body, "repRecords")) != 0 {
			t.Errorf("got %d %v, want 200 with no records", none.Status, none.Body)
		}
		if hidden.Status != http.StatusNotFound || hidden.ErrorCode() != "exercise_not_found" {
			t.Errorf("got %d %q, want 404 exercise_not_found", hidden.Status, hidden.ErrorCode())
		}
	})
}

type set struct {
	weight float64
	unit   string
	reps   int
}

// logWorkout logs a finished session of one exercise with the given sets, and
// returns its id.
func logWorkout(t *testing.T, srv *httptest.Server, token, exercise string, sets ...set) string {
	t.Helper()
	id := startSession(t, srv, token)
	e := addExercise(t, srv, token, id, exercise)
	for _, s := range sets {
		logSetIn(t, srv, token, id, e, s.weight, s.unit, s.reps)
	}
	finishSession(t, srv, token, id)
	return id
}

// sessionRecords returns a session's Personal records as served by its
// detail, each as "<exercise> <kind> <weight><unit>×<reps>".
func sessionRecords(t *testing.T, srv *httptest.Server, token, sessionID string) string {
	t.Helper()
	res := testutil.Do(t, srv, http.MethodGet, "/workouts/sessions/"+sessionID, token, nil)
	return describeRecords(objects(t, res.Body, "personalRecords"))
}

func describeRecords(records []map[string]any) string {
	out := make([]string, len(records))
	for i, r := range records {
		out[i] = fmt.Sprintf("%v %v %v%v×%v", r["name"], r["kind"], r["weight"], r["weightUnit"], r["reps"])
	}
	return fmt.Sprint(out)
}
