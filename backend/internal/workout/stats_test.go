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
	// and two sets of pull-ups at bodyweight (0), which add no Volume but
	// count as Sets.
	logMixedWorkout := func(t *testing.T, token string) string {
		t.Helper()
		id := startSession(t, srv, token)
		logSetIn(t, srv, token, id, addExercise(t, srv, token, id, "Bench Press"), 100, "kg", 5)
		logSetIn(t, srv, token, id, addExercise(t, srv, token, id, "Back Squat"), 100, "lb", 10)
		pullUp := addExercise(t, srv, token, id, "Pull-up")
		logSetIn(t, srv, token, id, pullUp, 0, "kg", 10)
		logSetIn(t, srv, token, id, pullUp, 0, "kg", 8)
		finishSession(t, srv, token, id)
		started := time.Date(2026, 10, 28, 18, 0, 0, 0, time.UTC)
		setSessionTimes(t, id, started, started.Add(90*time.Minute))
		return id
	}

	t.Run("lists each finished session with its duration, Volume, exercise count and set count", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		setUnitPreference(t, srv, token, "kg")
		logMixedWorkout(t, token)

		res := testutil.Do(t, srv, http.MethodGet, "/workouts/sessions", token, nil)

		stats := statsOf(t, objects(t, res.Body, "sessions")[0])
		wantStats(t, stats, 90*60, 953.6, "kg", 3, 4) // 500 kg + 1000 lb (453.59 kg)
	})

	t.Run("leaves warm-ups out of Volume and the set count", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		setUnitPreference(t, srv, token, "kg")
		id := startSession(t, srv, token)
		bench := addExercise(t, srv, token, id, "Bench Press")
		logTypedSet(t, srv, token, id, bench, 60, 10, "warmup")
		logTypedSet(t, srv, token, id, bench, 100, 5, "normal")
		logTypedSet(t, srv, token, id, bench, 100, 4, "failure")
		logTypedSet(t, srv, token, id, bench, 80, 5, "drop")
		finishSession(t, srv, token, id)

		list := testutil.Do(t, srv, http.MethodGet, "/workouts/sessions", token, nil)
		detail := testutil.Do(t, srv, http.MethodGet, "/workouts/sessions/"+id, token, nil)

		for name, stats := range map[string]map[string]any{
			"list": statsOf(t, objects(t, list.Body, "sessions")[0]), "detail": statsOf(t, detail.Body),
		} {
			if stats["volume"] != 1300.0 || stats["setCount"] != 3.0 { // 500 + 400 + 400; not the 600 kg warm-up
				t.Errorf("%s: volume = %v, setCount = %v, want 1300 kg over 3 sets", name, stats["volume"], stats["setCount"])
			}
		}
	})

	t.Run("shows Volume in the user's unit preference", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		setUnitPreference(t, srv, token, "lb")
		logMixedWorkout(t, token)

		res := testutil.Do(t, srv, http.MethodGet, "/workouts/sessions", token, nil)

		stats := statsOf(t, objects(t, res.Body, "sessions")[0])
		wantStats(t, stats, 90*60, 2102.3, "lb", 3, 4) // 500 kg (1102.31 lb) + 1000 lb
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
		wantStats(t, statsOf(t, res.Body), 90*60, 953.6, "kg", 3, 4)
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

func TestSessionRoutineName(t *testing.T) {
	srv := testutil.NewServer(t)

	t.Run("names a session after its routine as it's named now, and leaves a freeform one unnamed", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		routine := createRoutine(t, srv, token, map[string]any{
			"name": "Push day",
			"slots": []map[string]any{{"exerciseId": exerciseID(t, srv, token, "Bench Press"), "targetSets": 1,
				"targetReps": 5, "targetWeight": 100, "weightUnit": "kg"}},
		})
		fromRoutine := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions", token,
			map[string]any{"routineId": routine}).Body["id"].(string)
		bench := sessionExercises(t, testutil.Do(t, srv, http.MethodGet, "/workouts/sessions/"+fromRoutine, token, nil))[0]
		logSetIn(t, srv, token, fromRoutine, bench["id"].(string), 100, "kg", 5)
		finishSession(t, srv, token, fromRoutine)
		testutil.Do(t, srv, http.MethodPut, "/routines/"+routine, token, map[string]any{
			"name": "Chest day",
			"slots": []map[string]any{{"exerciseId": exerciseID(t, srv, token, "Bench Press"), "targetSets": 1,
				"targetReps": 5, "targetWeight": 100, "weightUnit": "kg"}},
		})
		freeform := startSession(t, srv, token)
		logOneSet(t, srv, token, freeform)
		finishSession(t, srv, token, freeform)

		list := objects(t, testutil.Do(t, srv, http.MethodGet, "/workouts/sessions", token, nil).Body, "sessions")
		detail := testutil.Do(t, srv, http.MethodGet, "/workouts/sessions/"+fromRoutine, token, nil)

		if list[1]["id"] != fromRoutine || list[1]["routineName"] != "Chest day" {
			t.Errorf("listed %v, want routineName Chest day", list[1])
		}
		if list[0]["id"] != freeform || list[0]["routineName"] != nil {
			t.Errorf("listed %v, want no routineName", list[0])
		}
		if detail.Body["routineName"] != "Chest day" {
			t.Errorf("detail routineName = %v, want Chest day", detail.Body["routineName"])
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

	t.Run("leaves warm-ups out of the totals", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		setUnitPreference(t, srv, token, "kg")
		id := startSession(t, srv, token)
		bench := addExercise(t, srv, token, id, "Bench Press")
		logTypedSet(t, srv, token, id, bench, 40, 10, "warmup")
		logTypedSet(t, srv, token, id, bench, 50, 10, "normal")
		finishSession(t, srv, token, id)
		setSessionTimes(t, id, weekStart.Add(time.Hour), weekStart.Add(2*time.Hour))

		res := testutil.Do(t, srv, http.MethodGet, totalsPath(weekStart, weekEnd), token, nil)

		if res.Body["volume"] != 500.0 {
			t.Errorf("volume = %v, want 500 kg, without the warm-up", res.Body["volume"])
		}
		got := fmt.Sprint(objects(t, res.Body, "setsPerMuscleGroup"))
		if want := "[map[muscleGroup:chest sets:1]]"; got != want {
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

// logTypedSet logs a set of weight kg × reps of the Set type setType.
func logTypedSet(t *testing.T, srv *httptest.Server, token, sessionID, sessionExerciseID string, weight float64,
	reps int, setType string) {
	t.Helper()
	res := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions/"+sessionID+"/exercises/"+sessionExerciseID+"/sets",
		token, map[string]any{"weight": weight, "weightUnit": "kg", "reps": reps, "type": setType})
	if res.Status != http.StatusCreated {
		t.Fatalf("log %s set: status %d, body %v", setType, res.Status, res.Body)
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

func wantStats(t *testing.T, stats map[string]any, durationSeconds, volume float64, unit string, exerciseCount, setCount float64) {
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
	if stats["setCount"] != setCount {
		t.Errorf("setCount = %v, want %v", stats["setCount"], setCount)
	}
}
