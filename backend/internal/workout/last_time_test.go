package workout_test

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/KolesnikovP/fitness_app/backend/internal/testutil"
)

func TestLastTime(t *testing.T) {
	srv := testutil.NewServer(t)

	t.Run("a session exercise has its exercise's sets from the most recent finished session of it, in order", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		setUnitPreference(t, srv, token, "kg")
		older := logWorkout(t, srv, token, "Bench Press", set{90, "kg", 5})
		recent := startSession(t, srv, token)
		e := addExercise(t, srv, token, recent, "Bench Press")
		logRPESet(t, srv, token, recent, e, 100, 5, 8)
		logSetIn(t, srv, token, recent, e, 102.5, "kg", 4)
		finishSession(t, srv, token, recent)
		setSessionTimes(t, older, time.Now().Add(-48*time.Hour), time.Now().Add(-47*time.Hour))
		// A later session without it doesn't count.
		logWorkout(t, srv, token, "Back Squat", set{140, "kg", 5})
		current := startSession(t, srv, token)
		addExercise(t, srv, token, current, "Bench Press")
		addExercise(t, srv, token, current, "Deadlift")

		exercises := currentExercises(t, srv, token)

		if got, want := describeLastTime(t, exercises[0]), "[100kg×5@8 102.5kg×4]"; got != want {
			t.Errorf("Bench Press lastTime = %s, want %s", got, want)
		}
		if got, want := describeLastTime(t, exercises[1]), "[]"; got != want {
			t.Errorf("Deadlift lastTime = %s, want %s", got, want)
		}
	})

	t.Run("warm-ups keep their places", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		setUnitPreference(t, srv, token, "kg")
		done := startSession(t, srv, token)
		e := addExercise(t, srv, token, done, "Bench Press")
		logTypedSet(t, srv, token, done, e, 60, 10, "warmup")
		logTypedSet(t, srv, token, done, e, 100, 5, "normal")
		finishSession(t, srv, token, done)
		current := startSession(t, srv, token)
		addExercise(t, srv, token, current, "Bench Press")

		if got, want := describeLastTime(t, currentExercises(t, srv, token)[0]), "[60kg×10 100kg×5]"; got != want {
			t.Errorf("lastTime = %s, want %s", got, want)
		}
	})

	t.Run("is in the user's unit preference", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		setUnitPreference(t, srv, token, "lb")
		// 100 kg is 220.5 lb; 135 lb stays as logged.
		logWorkout(t, srv, token, "Bench Press", set{100, "kg", 5}, set{135, "lb", 8})
		current := startSession(t, srv, token)
		addExercise(t, srv, token, current, "Bench Press")

		if got, want := describeLastTime(t, currentExercises(t, srv, token)[0]), "[220.5lb×5 135lb×8]"; got != want {
			t.Errorf("lastTime = %s, want %s", got, want)
		}
	})

	t.Run("a swapped set counts for the exercise swapped to", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		setUnitPreference(t, srv, token, "kg")
		routine := createRoutine(t, srv, token, map[string]any{
			"name": "Push day",
			"slots": []map[string]any{{
				"exerciseId": exerciseID(t, srv, token, "Bench Press"), "targetSets": 2, "targetReps": 10,
				"targetWeight": 0, "weightUnit": "kg",
				"substituteIds": []string{exerciseID(t, srv, token, "Dumbbell Bench Press")},
			}},
		})
		started := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions", token, map[string]any{"routineId": routine})
		id, e := started.Body["id"].(string), sessionExercises(t, started)[0]["id"].(string)
		logSetIn(t, srv, token, id, e, 80, "kg", 10)
		testutil.Do(t, srv, http.MethodPatch, "/workouts/sessions/"+id+"/exercises/"+e, token,
			map[string]any{"exerciseId": exerciseID(t, srv, token, "Dumbbell Bench Press")})
		logSetIn(t, srv, token, id, e, 30, "kg", 10)
		finishSession(t, srv, token, id)
		current := startSession(t, srv, token)
		addExercise(t, srv, token, current, "Bench Press")
		addExercise(t, srv, token, current, "Dumbbell Bench Press")

		exercises := currentExercises(t, srv, token)

		if got, want := describeLastTime(t, exercises[0]), "[80kg×10]"; got != want {
			t.Errorf("Bench Press lastTime = %s, want %s", got, want)
		}
		if got, want := describeLastTime(t, exercises[1]), "[30kg×10]"; got != want {
			t.Errorf("Dumbbell Bench Press lastTime = %s, want %s", got, want)
		}
	})

	t.Run("a session in progress or another user's doesn't count", func(t *testing.T) {
		_, _, other := testutil.SignUp(t, srv)
		logWorkout(t, srv, other, "Bench Press", set{100, "kg", 5})
		_, _, token := testutil.SignUp(t, srv)
		setUnitPreference(t, srv, token, "kg")
		current := startSession(t, srv, token)
		e := addExercise(t, srv, token, current, "Bench Press")
		logSetIn(t, srv, token, current, e, 100, "kg", 5)

		if got, want := describeLastTime(t, currentExercises(t, srv, token)[0]), "[]"; got != want {
			t.Errorf("lastTime = %s, want %s", got, want)
		}
	})
}

// logRPESet logs a set of weight kg × reps at rpe.
func logRPESet(t *testing.T, srv *httptest.Server, token, sessionID, sessionExerciseID string, weight float64,
	reps int, rpe float64) {
	t.Helper()
	res := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions/"+sessionID+"/exercises/"+sessionExerciseID+"/sets",
		token, map[string]any{"weight": weight, "weightUnit": "kg", "reps": reps, "rpe": rpe})
	if res.Status != http.StatusCreated {
		t.Fatalf("log set: status %d, body %v", res.Status, res.Body)
	}
}

// describeLastTime returns a session exercise's lastTime, each Set as
// "<weight><unit>×<reps>", with "@<rpe>" when it has one.
func describeLastTime(t *testing.T, exercise map[string]any) string {
	t.Helper()
	sets := objects(t, exercise, "lastTime")
	out := make([]string, len(sets))
	for i, s := range sets {
		out[i] = fmt.Sprintf("%v%v×%v", s["weight"], s["weightUnit"], s["reps"])
		if s["rpe"] != nil {
			out[i] += fmt.Sprintf("@%v", s["rpe"])
		}
	}
	return fmt.Sprint(out)
}
