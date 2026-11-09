package workout_test

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/KolesnikovP/fitness_app/backend/internal/testutil"
)

func TestExerciseBests(t *testing.T) {
	srv := testutil.NewServer(t)

	t.Run("each Best with its Set or number and date, from Sets in mixed kg and lb, in the user's unit preference", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		setUnitPreference(t, srv, token, "kg")
		// 100 × 5 is 116.7 estimated; 135 lb × 12, 734.8 kg, is the best Set
		// volume, and with 100 × 5 makes the best Exercise volume, 1234.8 kg.
		first := logWorkout(t, srv, token, "Bench Press", set{100, "kg", 5}, set{135, "lb", 12})
		// 240 lb is 108.86 kg: the heaviest, and 119.7 estimated.
		second := logWorkout(t, srv, token, "Bench Press", set{240, "lb", 3}, set{225, "lb", 1})
		// 40 reps in all, the most in one Session.
		third := logWorkout(t, srv, token, "Bench Press", set{0, "kg", 30}, set{50, "lb", 10})
		inProgress := startSession(t, srv, token)
		logSetIn(t, srv, token, inProgress, addExercise(t, srv, token, inProgress, "Bench Press"), 200, "kg", 50)
		bench := exerciseID(t, srv, token, "Bench Press")

		kg := exerciseBests(t, srv, token, bench)
		setUnitPreference(t, srv, token, "lb")
		lb := exerciseBests(t, srv, token, bench)

		if want := strings.Join([]string{
			"estimated1RM 119.7kg 240lb×3 " + second,
			"heaviestWeight 108.9kg 240lb×3 " + second,
			"setVolume 734.8kg 135lb×12 " + first,
			"exerciseVolume 1234.8kg " + first,
			"mostReps 40 " + third,
		}, "; "); kg != want {
			t.Errorf("bests in kg =\n%s\nwant\n%s", kg, want)
		}
		if want := strings.Join([]string{
			"estimated1RM 264lb 240lb×3 " + second,
			"heaviestWeight 240lb 240lb×3 " + second,
			"setVolume 1620lb 135lb×12 " + first,
			"exerciseVolume 2722.3lb " + first,
			"mostReps 40 " + third,
		}, "; "); lb != want {
			t.Errorf("bests in lb =\n%s\nwant\n%s", lb, want)
		}
	})

	t.Run("an equal later value doesn't take a Best over", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		setUnitPreference(t, srv, token, "kg")
		first := logWorkout(t, srv, token, "Bench Press", set{100, "kg", 5})
		logWorkout(t, srv, token, "Bench Press", set{100, "kg", 5})

		if got, want := exerciseBests(t, srv, token, exerciseID(t, srv, token, "Bench Press")), strings.Join([]string{
			"estimated1RM 116.7kg 100kg×5 " + first,
			"heaviestWeight 100kg 100kg×5 " + first,
			"setVolume 500kg 100kg×5 " + first,
			"exerciseVolume 500kg " + first,
			"mostReps 5 " + first,
		}, "; "); got != want {
			t.Errorf("bests =\n%s\nwant\n%s", got, want)
		}
	})

	t.Run("follow a corrected Set", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		setUnitPreference(t, srv, token, "kg")
		first := startSession(t, srv, token)
		typo := logOneSet(t, srv, token, first) // 100 kg × 5
		finishSession(t, srv, token, first)
		later := logWorkout(t, srv, token, "Bench Press", set{90, "kg", 5})
		bench := exerciseID(t, srv, token, "Bench Press")
		if got := exerciseBests(t, srv, token, bench); !strings.HasPrefix(got, "estimated1RM 116.7kg 100kg×5 "+first) {
			t.Fatalf("bests = %s, want the 100 kg Set's before the correction", got)
		}

		testutil.Pool(t).Exec(t.Context(), "UPDATE session_sets SET weight = 80 WHERE id = $1", typo)

		if got, want := exerciseBests(t, srv, token, bench), strings.Join([]string{
			"estimated1RM 105kg 90kg×5 " + later,
			"heaviestWeight 90kg 90kg×5 " + later,
			"setVolume 450kg 90kg×5 " + later,
			"exerciseVolume 450kg " + later,
			"mostReps 5 " + first,
		}, "; "); got != want {
			t.Errorf("bests =\n%s\nwant\n%s", got, want)
		}
	})

	t.Run("an exercise only ever done at weight 0 has total reps and most reps, and no weight-based Bests", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		setUnitPreference(t, srv, token, "kg")
		most := logWorkout(t, srv, token, "Pull-up", set{0, "kg", 10}, set{0, "kg", 12})
		fewer := logWorkout(t, srv, token, "Pull-up", set{0, "kg", 8})
		pullUp := exerciseID(t, srv, token, "Pull-up")

		if got, want := exerciseBests(t, srv, token, pullUp), strings.Join([]string{
			"estimated1RM <nil>", "heaviestWeight <nil>", "setVolume <nil>", "exerciseVolume <nil>",
			"mostReps 22 " + most,
		}, "; "); got != want {
			t.Errorf("bests =\n%s\nwant\n%s", got, want)
		}
		if got, want := describeProgress(objects(t, progress(t, srv, token, pullUp).Body, "sessions")), fmt.Sprint([]string{
			most + " estimated1RM 0 heaviest 0 setVol 0 vol 0 reps 22 record false",
			fewer + " estimated1RM 0 heaviest 0 setVol 0 vol 0 reps 8 record false",
		}); got != want {
			t.Errorf("progress =\n%s\nwant\n%s", got, want)
		}
	})

	t.Run("one finished Session has its Bests but no Personal record", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		setUnitPreference(t, srv, token, "kg")
		id := logWorkout(t, srv, token, "Deadlift", set{140, "kg", 3})

		if got := sessionRecords(t, srv, token, id); got != "[]" {
			t.Errorf("records = %s, want none", got)
		}
		if got, want := exerciseBests(t, srv, token, exerciseID(t, srv, token, "Deadlift")), strings.Join([]string{
			"estimated1RM 154kg 140kg×3 " + id,
			"heaviestWeight 140kg 140kg×3 " + id,
			"setVolume 420kg 140kg×3 " + id,
			"exerciseVolume 420kg " + id,
			"mostReps 3 " + id,
		}, "; "); got != want {
			t.Errorf("bests =\n%s\nwant\n%s", got, want)
		}
	})

	t.Run("an exercise never done has none", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)

		if got, want := exerciseBests(t, srv, token, exerciseID(t, srv, token, "Bench Press")),
			"estimated1RM <nil>; heaviestWeight <nil>; setVolume <nil>; exerciseVolume <nil>; mostReps <nil>"; got != want {
			t.Errorf("bests = %s, want %s", got, want)
		}
	})

	t.Run("leaves warm-ups out of every Best", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		setUnitPreference(t, srv, token, "kg")
		id := startSession(t, srv, token)
		e := addExercise(t, srv, token, id, "Bench Press")
		logTypedSet(t, srv, token, id, e, 150, 10, "warmup")
		logTypedSet(t, srv, token, id, e, 100, 5, "normal")
		finishSession(t, srv, token, id)

		got := exerciseBests(t, srv, token, exerciseID(t, srv, token, "Bench Press"))

		if want := strings.Join([]string{
			"estimated1RM 116.7kg 100kg×5 " + id,
			"heaviestWeight 100kg 100kg×5 " + id,
			"setVolume 500kg 100kg×5 " + id,
			"exerciseVolume 500kg " + id,
			"mostReps 5 " + id,
		}, "; "); got != want {
			t.Errorf("bests =\n%s\nwant\n%s", got, want)
		}
	})
}

// exerciseBests returns the caller's Bests for an Exercise, from its records,
// each as "<measure> <value><unit> <weight><unit>×<reps> <session id>", the
// Set left out for a measure that has none, or "<measure> <nil>".
func exerciseBests(t *testing.T, srv *httptest.Server, token, exerciseID string) string {
	t.Helper()
	res := testutil.Do(t, srv, http.MethodGet, "/workouts/exercises/"+exerciseID+"/records", token, nil)
	if res.Status != http.StatusOK {
		t.Fatalf("GET records: status %d, body %v", res.Status, res.Body)
	}
	bests, ok := res.Body["bests"].(map[string]any)
	if !ok {
		t.Fatalf("bests = %v, want an object", res.Body["bests"])
	}
	var out []string
	for _, measure := range []string{"estimated1RM", "heaviestWeight", "setVolume", "exerciseVolume", "mostReps"} {
		b, ok := bests[measure].(map[string]any)
		if !ok {
			out = append(out, fmt.Sprintf("%s %v", measure, bests[measure]))
			continue
		}
		if b["achievedAt"] == nil || b["achievedAt"] == "" {
			t.Errorf("%s has no achievedAt", measure)
		}
		unit, _ := b["unit"].(string)
		line := fmt.Sprintf("%s %v%s", measure, b["value"], unit)
		if s, ok := b["set"].(map[string]any); ok {
			if s["setId"] == nil {
				t.Errorf("%s's set has no setId", measure)
			}
			line += fmt.Sprintf(" %v%v×%v", s["weight"], s["weightUnit"], s["reps"])
		}
		out = append(out, line+fmt.Sprintf(" %v", b["sessionId"]))
	}
	return strings.Join(out, "; ")
}
