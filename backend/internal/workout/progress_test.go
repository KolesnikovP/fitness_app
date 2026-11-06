package workout_test

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/KolesnikovP/fitness_app/backend/internal/testutil"
)

func TestExerciseProgress(t *testing.T) {
	srv := testutil.NewServer(t)

	t.Run("each finished session of the exercise has its best Estimated 1RM, heaviest weight and Volume, oldest first", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		setUnitPreference(t, srv, token, "kg")
		first := logWorkout(t, srv, token, "Bench Press", set{100, "kg", 5}, set{0, "kg", 10})
		// 225 lb is 102.06 kg: 112.3 estimated, short of 90 × 8's 114.0.
		mixed := logWorkout(t, srv, token, "Bench Press", set{225, "lb", 3}, set{90, "kg", 8})
		record := logWorkout(t, srv, token, "Bench Press", set{105, "kg", 5})
		logWorkout(t, srv, token, "Back Squat", set{140, "kg", 5})
		inProgress := startSession(t, srv, token)
		logSetIn(t, srv, token, inProgress, addExercise(t, srv, token, inProgress, "Bench Press"), 200, "kg", 1)

		res := progress(t, srv, token, exerciseID(t, srv, token, "Bench Press"))

		if res.Status != http.StatusOK {
			t.Fatalf("status = %d, want 200; body %v", res.Status, res.Body)
		}
		if res.Body["unit"] != "kg" {
			t.Errorf("unit = %v, want kg", res.Body["unit"])
		}
		got := describeProgress(objects(t, res.Body, "sessions"))
		want := fmt.Sprint([]string{
			first + " e1RM 116.7 top 100 vol 500 record false",
			mixed + " e1RM 114 top 102.1 vol 1026.2 record false",
			record + " e1RM 122.5 top 105 vol 525 record true",
		})
		if got != want {
			t.Errorf("sessions =\n%s\nwant\n%s", got, want)
		}
		for _, s := range objects(t, res.Body, "sessions") {
			if s["finishedAt"] == nil || s["finishedAt"] == "" {
				t.Errorf("session %v has no finishedAt", s["sessionId"])
			}
		}
	})

	t.Run("is in the user's unit preference", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		setUnitPreference(t, srv, token, "lb")
		id := logWorkout(t, srv, token, "Bench Press", set{100, "kg", 5})

		res := progress(t, srv, token, exerciseID(t, srv, token, "Bench Press"))

		if res.Body["unit"] != "lb" {
			t.Errorf("unit = %v, want lb", res.Body["unit"])
		}
		if got, want := describeProgress(objects(t, res.Body, "sessions")),
			fmt.Sprint([]string{id + " e1RM 257.2 top 220.5 vol 1102.3 record false"}); got != want {
			t.Errorf("sessions = %s, want %s", got, want)
		}
	})

	t.Run("a swapped set counts for the exercise swapped to", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		setUnitPreference(t, srv, token, "kg")
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
		logSetIn(t, srv, token, id, e, 30, "kg", 10)
		finishSession(t, srv, token, id)

		dumbbell := progress(t, srv, token, exerciseID(t, srv, token, "Dumbbell Bench Press"))
		barbell := progress(t, srv, token, exerciseID(t, srv, token, "Bench Press"))

		if got, want := describeProgress(objects(t, dumbbell.Body, "sessions")),
			fmt.Sprint([]string{id + " e1RM 40 top 30 vol 300 record false"}); got != want {
			t.Errorf("Dumbbell Bench Press sessions = %s, want %s", got, want)
		}
		if list := objects(t, barbell.Body, "sessions"); len(list) != 0 {
			t.Errorf("Bench Press sessions = %v, want none", list)
		}
	})

	t.Run("an exercise never logged has no sessions, and one the caller can't see is not found", func(t *testing.T) {
		_, _, owner := testutil.SignUp(t, srv)
		custom := createCustomExercise(t, srv, owner, "Belt Squat")
		_, _, token := testutil.SignUp(t, srv)

		none := progress(t, srv, token, exerciseID(t, srv, token, "Bench Press"))
		hidden := progress(t, srv, token, custom)

		if none.Status != http.StatusOK || len(objects(t, none.Body, "sessions")) != 0 {
			t.Errorf("got %d %v, want 200 with no sessions", none.Status, none.Body)
		}
		if hidden.Status != http.StatusNotFound || hidden.ErrorCode() != "exercise_not_found" {
			t.Errorf("got %d %q, want 404 exercise_not_found", hidden.Status, hidden.ErrorCode())
		}
	})
}

func progress(t *testing.T, srv *httptest.Server, token, exerciseID string) testutil.Response {
	t.Helper()
	return testutil.Do(t, srv, http.MethodGet, "/workouts/exercises/"+exerciseID+"/progress", token, nil)
}

// describeProgress renders each session's point as "<id> e1RM <n> top <n>
// vol <n> record <bool>".
func describeProgress(sessions []map[string]any) string {
	out := make([]string, 0, len(sessions))
	for _, s := range sessions {
		out = append(out, fmt.Sprintf("%v e1RM %v top %v vol %v record %v",
			s["sessionId"], s["estimated1RM"], s["heaviestWeight"], s["volume"], s["personalRecord"]))
	}
	return fmt.Sprint(out)
}
