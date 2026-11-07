package workout_test

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/KolesnikovP/fitness_app/backend/internal/testutil"
)

func TestBestEstimated1RMs(t *testing.T) {
	srv := testutil.NewServer(t)

	t.Run("a new User has none", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)

		if got := bests(t, srv, token); got != "[]" {
			t.Fatalf("bests = %s, want none", got)
		}
	})

	t.Run("each Exercise's best Estimated 1RM ever, by name, with the Session it was set in", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		logWorkout(t, srv, token, "Bench Press", set{100, "kg", 5})
		best := logWorkout(t, srv, token, "Bench Press", set{105, "kg", 5}, set{110, "kg", 1})
		logWorkout(t, srv, token, "Bench Press", set{100, "kg", 6})
		deadlift := logWorkout(t, srv, token, "Deadlift", set{140, "kg", 3})
		logWorkout(t, srv, token, "Pull-up", set{0, "kg", 10}) // No weight, so no Estimated 1RM.

		if got, want := bests(t, srv, token), fmt.Sprintf("[Bench Press 122.5kg 105kg×5 %s Deadlift 154kg 140kg×3 %s]", best, deadlift); got != want {
			t.Fatalf("bests = %s, want %s", got, want)
		}
	})

	t.Run("in the User's Unit preference", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := logWorkout(t, srv, token, "Bench Press", set{105, "kg", 5})
		setUnitPreference(t, srv, token, "lb")

		if got, want := bests(t, srv, token), fmt.Sprintf("[Bench Press 270.1lb 105kg×5 %s]", id); got != want {
			t.Fatalf("bests = %s, want %s", got, want)
		}
	})

	t.Run("leaves out Sessions in progress and other Users'", func(t *testing.T) {
		_, _, mine := testutil.SignUp(t, srv)
		_, _, theirs := testutil.SignUp(t, srv)
		logWorkout(t, srv, theirs, "Bench Press", set{100, "kg", 5})
		id := startSession(t, srv, mine)
		logSet(t, srv, mine, id, addExercise(t, srv, mine, id, "Bench Press"), 100, 5)

		if got := bests(t, srv, mine); got != "[]" {
			t.Fatalf("bests = %s, want none", got)
		}
	})
}

// bests returns the caller's best Estimated 1RMs, each as "<exercise>
// <e1RM><unit> <weight><unit>×<reps> <session id>".
func bests(t *testing.T, srv *httptest.Server, token string) string {
	t.Helper()
	res := testutil.Do(t, srv, http.MethodGet, "/workouts/records", token, nil)
	if res.Status != http.StatusOK {
		t.Fatalf("GET /workouts/records: status %d, body %v", res.Status, res.Body)
	}
	var out []string
	for _, e := range objects(t, res.Body, "exercises") {
		b := e["best"].(map[string]any)
		out = append(out, fmt.Sprintf("%v %v%v %v%v×%v %v", e["name"], b["estimated1RM"], b["estimated1RMUnit"],
			b["weight"], b["weightUnit"], b["reps"], b["sessionId"]))
	}
	return fmt.Sprint(out)
}
