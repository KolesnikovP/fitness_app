package workout_test

import (
	"context"
	"fmt"
	"math"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/KolesnikovP/fitness_app/backend/internal/testutil"
)

func TestSessionStats(t *testing.T) {
	srv := testutil.NewServer(t)

	// A workout of an hour and a half: 100 kg × 5 bench, 100 lb × 10 squat,
	// and pull-ups at bodyweight (0), which add no Volume.
	logMixedWorkout := func(t *testing.T, token string) string {
		t.Helper()
		id := startSession(t, srv, token)
		logSetIn(t, srv, token, id, addExercise(t, srv, token, id, "Bench Press"), 100, "kg", 5)
		logSetIn(t, srv, token, id, addExercise(t, srv, token, id, "Back Squat"), 100, "lb", 10)
		logSetIn(t, srv, token, id, addExercise(t, srv, token, id, "Pull-up"), 0, "kg", 10)
		finishSession(t, srv, token, id)
		started := time.Date(2026, 10, 28, 18, 0, 0, 0, time.UTC)
		setSessionTimes(t, id, started, started.Add(90*time.Minute))
		return id
	}

	t.Run("lists each finished session with its duration, Volume and exercise count", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		setUnitPreference(t, srv, token, "kg")
		logMixedWorkout(t, token)

		res := testutil.Do(t, srv, http.MethodGet, "/workouts/sessions", token, nil)

		stats := statsOf(t, objects(t, res.Body, "sessions")[0])
		wantStats(t, stats, 90*60, 953.6, "kg", 3) // 500 kg + 1000 lb (453.59 kg)
	})

	t.Run("shows Volume in the user's unit preference", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		setUnitPreference(t, srv, token, "lb")
		logMixedWorkout(t, token)

		res := testutil.Do(t, srv, http.MethodGet, "/workouts/sessions", token, nil)

		stats := statsOf(t, objects(t, res.Body, "sessions")[0])
		wantStats(t, stats, 90*60, 2102.3, "lb", 3) // 500 kg (1102.31 lb) + 1000 lb
	})

	t.Run("serves a session's detail with the same stats", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		setUnitPreference(t, srv, token, "kg")
		id := logMixedWorkout(t, token)

		res := testutil.Do(t, srv, http.MethodGet, "/workouts/sessions/"+id, token, nil)

		if res.Status != http.StatusOK {
			t.Fatalf("status = %d, want 200; body %v", res.Status, res.Body)
		}
		if got := sessionExercises(t, res); len(got) != 3 || len(objects(t, got[1], "sets")) != 1 {
			t.Errorf("exercises = %v, want the three exercises with their sets", got)
		}
		wantStats(t, statsOf(t, res.Body), 90*60, 953.6, "kg", 3)
	})

	t.Run("has no stats while in progress", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := startSession(t, srv, token)
		logOneSet(t, srv, token, id)

		res := testutil.Do(t, srv, http.MethodGet, "/workouts/sessions/"+id, token, nil)

		if res.Status != http.StatusOK || res.Body["stats"] != nil {
			t.Fatalf("got %d, stats %v; want 200 with no stats", res.Status, res.Body["stats"])
		}
	})

	t.Run("refuses another user's session", func(t *testing.T) {
		_, _, owner := testutil.SignUp(t, srv)
		id := logMixedWorkout(t, owner)
		_, _, token := testutil.SignUp(t, srv)

		res := testutil.Do(t, srv, http.MethodGet, "/workouts/sessions/"+id, token, nil)

		if res.Status != http.StatusNotFound || res.ErrorCode() != "session_not_found" {
			t.Fatalf("got %d %q, want 404 session_not_found", res.Status, res.ErrorCode())
		}
	})

	t.Run("follows a corrected set", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		setUnitPreference(t, srv, token, "kg")
		id := startSession(t, srv, token)
		setID := logOneSet(t, srv, token, id) // 100 kg × 5
		testutil.Do(t, srv, http.MethodPatch, "/workouts/sessions/"+id+"/sets/"+setID, token,
			map[string]any{"weight": 60, "weightUnit": "kg", "reps": 5})
		finishSession(t, srv, token, id)

		res := testutil.Do(t, srv, http.MethodGet, "/workouts/sessions/"+id, token, nil)

		if got := statsOf(t, res.Body)["volume"]; got != 300.0 {
			t.Errorf("volume = %v, want 300", got)
		}
	})
}

func TestWeeklyTotals(t *testing.T) {
	srv := testutil.NewServer(t)
	weekStart := time.Date(2026, 10, 26, 0, 0, 0, 0, time.UTC)
	weekEnd := weekStart.AddDate(0, 0, 7)

	// finishedAt logs a finished session of the named exercises, each with
	// one 50 kg × 10 set per entry, finished at finishedAt.
	logFinishedAt := func(t *testing.T, token string, finishedAt time.Time, exercises ...string) {
		t.Helper()
		id := startSession(t, srv, token)
		added := map[string]string{}
		for _, name := range exercises {
			if _, ok := added[name]; !ok {
				added[name] = addExercise(t, srv, token, id, name)
			}
			logSetIn(t, srv, token, id, added[name], 50, "kg", 10)
		}
		finishSession(t, srv, token, id)
		setSessionTimes(t, id, finishedAt.Add(-time.Hour), finishedAt)
	}

	t.Run("totals the sessions finished in the range, and their sets per muscle group", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		setUnitPreference(t, srv, token, "kg")
		logFinishedAt(t, token, weekStart, "Bench Press", "Bench Press")                                            // First instant: in.
		logFinishedAt(t, token, weekEnd.Add(-time.Second), "Back Squat", "Back Squat", "Back Squat", "Bench Press") // In.
		logFinishedAt(t, token, weekEnd, "Deadlift")                                                                // Next week.
		logFinishedAt(t, token, weekStart.Add(-time.Second), "Deadlift")                                            // Last week.
		startSession(t, srv, token)                                                                                 // In progress.
		_, _, other := testutil.SignUp(t, srv)
		logFinishedAt(t, other, weekStart.Add(time.Hour), "Plank")

		res := testutil.Do(t, srv, http.MethodGet, totalsPath(weekStart, weekEnd), token, nil)

		if res.Status != http.StatusOK {
			t.Fatalf("status = %d, want 200; body %v", res.Status, res.Body)
		}
		if res.Body["sessionCount"] != 2.0 {
			t.Errorf("sessionCount = %v, want 2", res.Body["sessionCount"])
		}
		if res.Body["volume"] != 3000.0 || res.Body["volumeUnit"] != "kg" {
			t.Errorf("volume = %v %v, want 3000 kg", res.Body["volume"], res.Body["volumeUnit"])
		}
		got := fmt.Sprint(objects(t, res.Body, "setsPerMuscleGroup"))
		if want := "[map[muscleGroup:chest sets:3] map[muscleGroup:quads sets:3]]"; got != want {
			t.Errorf("setsPerMuscleGroup = %s, want %s", got, want)
		}
	})

	t.Run("is empty for a week with no sessions", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)

		res := testutil.Do(t, srv, http.MethodGet, totalsPath(weekStart, weekEnd), token, nil)

		if res.Body["sessionCount"] != 0.0 || res.Body["volume"] != 0.0 {
			t.Errorf("totals = %v, want none", res.Body)
		}
		if list := objects(t, res.Body, "setsPerMuscleGroup"); len(list) != 0 {
			t.Errorf("setsPerMuscleGroup = %v, want none", list)
		}
	})

	t.Run("refuses a missing or backwards range", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)

		for _, path := range []string{
			"/workouts/totals",
			"/workouts/totals?from=yesterday&to=today",
			totalsPath(weekEnd, weekStart),
		} {
			res := testutil.Do(t, srv, http.MethodGet, path, token, nil)
			if res.Status != http.StatusBadRequest || res.ErrorCode() != "invalid_range" {
				t.Errorf("%s: got %d %q, want 400 invalid_range", path, res.Status, res.ErrorCode())
			}
		}
	})
}

func totalsPath(from, to time.Time) string {
	return "/workouts/totals?from=" + url.QueryEscape(from.Format(time.RFC3339)) +
		"&to=" + url.QueryEscape(to.Format(time.RFC3339))
}

// logSetIn logs a set of weight unit x reps.
func logSetIn(t *testing.T, srv *httptest.Server, token, sessionID, sessionExerciseID string, weight float64,
	unit string, reps int) {
	t.Helper()
	res := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions/"+sessionID+"/exercises/"+sessionExerciseID+"/sets",
		token, map[string]any{"weight": weight, "weightUnit": unit, "reps": reps})
	if res.Status != http.StatusCreated {
		t.Fatalf("log set: status %d, body %v", res.Status, res.Body)
	}
}

func setUnitPreference(t *testing.T, srv *httptest.Server, token, unit string) {
	t.Helper()
	res := testutil.Do(t, srv, http.MethodPatch, "/users/me", token, map[string]string{"unitPreference": unit})
	if res.Status != http.StatusOK {
		t.Fatalf("set unit preference: status %d, body %v", res.Status, res.Body)
	}
}

// setSessionTimes backdates a finished session, which the API always stamps
// with now, so tests can place it in time.
func setSessionTimes(t *testing.T, sessionID string, started, finished time.Time) {
	t.Helper()
	_, err := testutil.Pool(t).Exec(context.Background(),
		"UPDATE workout_sessions SET started_at = $2, finished_at = $3 WHERE id = $1", sessionID, started, finished)
	if err != nil {
		t.Fatalf("set session times: %v", err)
	}
}

func statsOf(t *testing.T, session map[string]any) map[string]any {
	t.Helper()
	stats, ok := session["stats"].(map[string]any)
	if !ok {
		t.Fatalf("no stats in %v", session)
	}
	return stats
}

func wantStats(t *testing.T, stats map[string]any, durationSeconds, volume float64, unit string, exerciseCount float64) {
	t.Helper()
	if stats["durationSeconds"] != durationSeconds {
		t.Errorf("durationSeconds = %v, want %v", stats["durationSeconds"], durationSeconds)
	}
	if v, _ := stats["volume"].(float64); math.Abs(v-volume) > 1e-9 || stats["volumeUnit"] != unit {
		t.Errorf("volume = %v %v, want %v %s", stats["volume"], stats["volumeUnit"], volume, unit)
	}
	if stats["exerciseCount"] != exerciseCount {
		t.Errorf("exerciseCount = %v, want %v", stats["exerciseCount"], exerciseCount)
	}
}
