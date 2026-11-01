package workout_test

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/KolesnikovP/fitness_app/backend/internal/testutil"
)

func TestStartSession(t *testing.T) {
	srv := testutil.NewServer(t)

	t.Run("starts an empty freeform session", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		before := time.Now().Add(-time.Second)

		res := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions", token, nil)

		if res.Status != http.StatusCreated {
			t.Fatalf("status = %d, want 201; body %v", res.Status, res.Body)
		}
		if res.Body["id"] == "" || res.Body["id"] == nil {
			t.Errorf("no id in %v", res.Body)
		}
		if started := parseTime(t, res.Body["startedAt"]); started.Before(before) {
			t.Errorf("startedAt = %v, want about now", started)
		}
		if res.Body["finishedAt"] != nil {
			t.Errorf("finishedAt = %v, want null", res.Body["finishedAt"])
		}
		if got := sessionExercises(t, res); len(got) != 0 {
			t.Errorf("exercises = %v, want none", got)
		}
	})

	t.Run("refuses a second session while one is in progress", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		startSession(t, srv, token)

		res := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions", token, nil)

		if res.Status != http.StatusConflict || res.ErrorCode() != "session_in_progress" {
			t.Fatalf("got %d %q, want 409 session_in_progress", res.Status, res.ErrorCode())
		}
	})

	t.Run("requires a login", func(t *testing.T) {
		res := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions", "", nil)

		if res.Status != http.StatusUnauthorized {
			t.Fatalf("status = %d, want 401", res.Status)
		}
	})
}

func TestCurrentSession(t *testing.T) {
	srv := testutil.NewServer(t)

	t.Run("returns the session in progress, to resume it", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := startSession(t, srv, token)

		res := testutil.Do(t, srv, http.MethodGet, "/workouts/sessions/current", token, nil)

		if res.Status != http.StatusOK {
			t.Fatalf("status = %d, want 200; body %v", res.Status, res.Body)
		}
		session, _ := res.Body["session"].(map[string]any)
		if session["id"] != id {
			t.Fatalf("session = %v, want id %s", res.Body["session"], id)
		}
	})

	t.Run("returns null when no session is in progress", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)

		res := testutil.Do(t, srv, http.MethodGet, "/workouts/sessions/current", token, nil)

		if res.Status != http.StatusOK {
			t.Fatalf("status = %d, want 200; body %v", res.Status, res.Body)
		}
		if session, ok := res.Body["session"]; !ok || session != nil {
			t.Fatalf("body = %v, want session: null", res.Body)
		}
	})

	t.Run("never returns another user's session", func(t *testing.T) {
		_, _, owner := testutil.SignUp(t, srv)
		startSession(t, srv, owner)
		_, _, other := testutil.SignUp(t, srv)

		res := testutil.Do(t, srv, http.MethodGet, "/workouts/sessions/current", other, nil)

		if res.Body["session"] != nil {
			t.Fatalf("got %v, want session: null", res.Body)
		}
	})
}

func TestAddExercise(t *testing.T) {
	srv := testutil.NewServer(t)

	t.Run("adds exercises in the order they were added", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := startSession(t, srv, token)

		addExercise(t, srv, token, id, "Deadlift")
		res := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions/"+id+"/exercises", token,
			map[string]string{"exerciseId": exerciseID(t, srv, token, "Bench Press")})

		if res.Status != http.StatusCreated {
			t.Fatalf("status = %d, want 201; body %v", res.Status, res.Body)
		}
		got := sessionExercises(t, res)
		if len(got) != 2 || got[0]["name"] != "Deadlift" || got[1]["name"] != "Bench Press" {
			t.Fatalf("exercises = %v, want Deadlift then Bench Press", got)
		}
		if got[1]["exerciseId"] != exerciseID(t, srv, token, "Bench Press") || got[1]["note"] != "" {
			t.Errorf("Bench Press = %v, want its exercise id and no note", got[1])
		}
		if sets := objects(t, got[1], "sets"); len(sets) != 0 {
			t.Errorf("sets = %v, want none", sets)
		}
	})

	t.Run("adds the caller's own custom exercise", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		custom := createCustomExercise(t, srv, token, "Belt Squat")
		id := startSession(t, srv, token)

		res := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions/"+id+"/exercises", token,
			map[string]string{"exerciseId": custom})

		if got := sessionExercises(t, res); len(got) != 1 || got[0]["name"] != "Belt Squat" {
			t.Fatalf("exercises = %v, want Belt Squat", got)
		}
	})

	t.Run("refuses another user's custom exercise", func(t *testing.T) {
		_, _, other := testutil.SignUp(t, srv)
		custom := createCustomExercise(t, srv, other, "Belt Squat")
		_, _, token := testutil.SignUp(t, srv)
		id := startSession(t, srv, token)

		res := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions/"+id+"/exercises", token,
			map[string]string{"exerciseId": custom})

		if res.Status != http.StatusNotFound || res.ErrorCode() != "exercise_not_found" {
			t.Fatalf("got %d %q, want 404 exercise_not_found", res.Status, res.ErrorCode())
		}
	})

	t.Run("refuses another user's session", func(t *testing.T) {
		_, _, owner := testutil.SignUp(t, srv)
		id := startSession(t, srv, owner)
		_, _, token := testutil.SignUp(t, srv)

		res := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions/"+id+"/exercises", token,
			map[string]string{"exerciseId": exerciseID(t, srv, token, "Deadlift")})

		if res.Status != http.StatusNotFound || res.ErrorCode() != "session_not_found" {
			t.Fatalf("got %d %q, want 404 session_not_found", res.Status, res.ErrorCode())
		}
	})
}

func TestLogSet(t *testing.T) {
	srv := testutil.NewServer(t)

	t.Run("logs sets in order, keeping the weight's unit and an optional note", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := startSession(t, srv, token)
		bench := addExercise(t, srv, token, id, "Bench Press")
		path := "/workouts/sessions/" + id + "/exercises/" + bench + "/sets"

		testutil.Do(t, srv, http.MethodPost, path, token, map[string]any{"weight": 100, "weightUnit": "kg", "reps": 5})
		res := testutil.Do(t, srv, http.MethodPost, path, token, map[string]any{
			"weight": 102.5, "weightUnit": "kg", "reps": 3, "note": "Paused reps",
		})

		if res.Status != http.StatusCreated {
			t.Fatalf("status = %d, want 201; body %v", res.Status, res.Body)
		}
		sets := objects(t, sessionExercises(t, res)[0], "sets")
		if len(sets) != 2 {
			t.Fatalf("sets = %v, want 2", sets)
		}
		first, second := sets[0], sets[1]
		if first["weight"] != 100.0 || first["weightUnit"] != "kg" || first["reps"] != 5.0 || first["note"] != "" {
			t.Errorf("first set = %v, want 100 kg x 5, no note", first)
		}
		if second["weight"] != 102.5 || second["reps"] != 3.0 || second["note"] != "Paused reps" {
			t.Errorf("second set = %v, want 102.5 kg x 3, noted", second)
		}
	})

	t.Run("logs a bodyweight set with no added weight, in pounds", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := startSession(t, srv, token)
		pullUp := addExercise(t, srv, token, id, "Pull-up")

		res := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions/"+id+"/exercises/"+pullUp+"/sets", token,
			map[string]any{"weight": 0, "weightUnit": "lb", "reps": 12})

		set := objects(t, sessionExercises(t, res)[0], "sets")[0]
		if set["weight"] != 0.0 || set["weightUnit"] != "lb" || set["reps"] != 12.0 {
			t.Fatalf("set = %v, want 0 lb x 12", set)
		}
	})

	t.Run("logs an optional RPE, in half steps from 1 to 10", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := startSession(t, srv, token)
		bench := addExercise(t, srv, token, id, "Bench Press")
		path := "/workouts/sessions/" + id + "/exercises/" + bench + "/sets"

		testutil.Do(t, srv, http.MethodPost, path, token, map[string]any{"weight": 100, "weightUnit": "kg", "reps": 5})
		testutil.Do(t, srv, http.MethodPost, path, token, map[string]any{"weight": 100, "weightUnit": "kg", "reps": 5, "rpe": nil})
		testutil.Do(t, srv, http.MethodPost, path, token, map[string]any{"weight": 100, "weightUnit": "kg", "reps": 5, "rpe": 1})
		res := testutil.Do(t, srv, http.MethodPost, path, token, map[string]any{"weight": 100, "weightUnit": "kg", "reps": 5, "rpe": 8.5})

		if res.Status != http.StatusCreated {
			t.Fatalf("status = %d, want 201; body %v", res.Status, res.Body)
		}
		sets := objects(t, sessionExercises(t, res)[0], "sets")
		if len(sets) != 4 {
			t.Fatalf("sets = %v, want 4", sets)
		}
		for i, want := range []any{nil, nil, 1.0, 8.5} {
			if got, ok := sets[i]["rpe"]; !ok || got != want {
				t.Errorf("set %d rpe = %v, want %v", i+1, got, want)
			}
		}
	})

	for _, tc := range []struct {
		name string
		body map[string]any
		code string
	}{
		{"missing weight", map[string]any{"weightUnit": "kg", "reps": 5}, "invalid_weight"},
		{"negative weight", map[string]any{"weight": -1, "weightUnit": "kg", "reps": 5}, "invalid_weight"},
		{"weight too large", map[string]any{"weight": 10000, "weightUnit": "kg", "reps": 5}, "invalid_weight"},
		{"unknown unit", map[string]any{"weight": 100, "weightUnit": "stone", "reps": 5}, "invalid_weight_unit"},
		{"missing reps", map[string]any{"weight": 100, "weightUnit": "kg"}, "invalid_reps"},
		{"zero reps", map[string]any{"weight": 100, "weightUnit": "kg", "reps": 0}, "invalid_reps"},
		{"note too long", map[string]any{"weight": 100, "weightUnit": "kg", "reps": 5, "note": strings.Repeat("a", 501)}, "invalid_note"},
		{"RPE below 1", map[string]any{"weight": 100, "weightUnit": "kg", "reps": 5, "rpe": 0}, "invalid_rpe"},
		{"RPE above 10", map[string]any{"weight": 100, "weightUnit": "kg", "reps": 5, "rpe": 10.5}, "invalid_rpe"},
		{"RPE between half steps", map[string]any{"weight": 100, "weightUnit": "kg", "reps": 5, "rpe": 7.3}, "invalid_rpe"},
	} {
		t.Run("rejects "+tc.name, func(t *testing.T) {
			_, _, token := testutil.SignUp(t, srv)
			id := startSession(t, srv, token)
			bench := addExercise(t, srv, token, id, "Bench Press")

			res := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions/"+id+"/exercises/"+bench+"/sets", token, tc.body)

			if res.Status != http.StatusBadRequest || res.ErrorCode() != tc.code {
				t.Fatalf("got %d %q, want 400 %s", res.Status, res.ErrorCode(), tc.code)
			}
		})
	}

	t.Run("refuses an exercise from another session", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		first := startSession(t, srv, token)
		bench := addExercise(t, srv, token, first, "Bench Press")
		logSet(t, srv, token, first, bench, 100, 5)
		finishSession(t, srv, token, first)
		second := startSession(t, srv, token)

		res := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions/"+second+"/exercises/"+bench+"/sets", token,
			map[string]any{"weight": 100, "weightUnit": "kg", "reps": 5})

		if res.Status != http.StatusNotFound || res.ErrorCode() != "session_exercise_not_found" {
			t.Fatalf("got %d %q, want 404 session_exercise_not_found", res.Status, res.ErrorCode())
		}
	})
}

func TestExerciseNote(t *testing.T) {
	srv := testutil.NewServer(t)

	t.Run("sets and clears the note on a session exercise", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := startSession(t, srv, token)
		bench := addExercise(t, srv, token, id, "Bench Press")
		path := "/workouts/sessions/" + id + "/exercises/" + bench

		res := testutil.Do(t, srv, http.MethodPatch, path, token, map[string]string{"note": "  Elbows tucked  "})

		if res.Status != http.StatusOK {
			t.Fatalf("status = %d, want 200; body %v", res.Status, res.Body)
		}
		if got := sessionExercises(t, res)[0]["note"]; got != "Elbows tucked" {
			t.Errorf("note = %q, want %q", got, "Elbows tucked")
		}

		res = testutil.Do(t, srv, http.MethodPatch, path, token, map[string]string{"note": ""})
		if got := sessionExercises(t, res)[0]["note"]; got != "" {
			t.Errorf("note = %q, want it cleared", got)
		}
	})

	t.Run("rejects a note that's too long", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := startSession(t, srv, token)
		bench := addExercise(t, srv, token, id, "Bench Press")

		res := testutil.Do(t, srv, http.MethodPatch, "/workouts/sessions/"+id+"/exercises/"+bench, token,
			map[string]string{"note": strings.Repeat("a", 501)})

		if res.Status != http.StatusBadRequest || res.ErrorCode() != "invalid_note" {
			t.Fatalf("got %d %q, want 400 invalid_note", res.Status, res.ErrorCode())
		}
	})

	t.Run("refuses an unknown session exercise", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := startSession(t, srv, token)

		res := testutil.Do(t, srv, http.MethodPatch, "/workouts/sessions/"+id+"/exercises/"+uuid.NewString(), token,
			map[string]string{"note": "x"})

		if res.Status != http.StatusNotFound || res.ErrorCode() != "session_exercise_not_found" {
			t.Fatalf("got %d %q, want 404 session_exercise_not_found", res.Status, res.ErrorCode())
		}
	})
}

func TestFinishSession(t *testing.T) {
	srv := testutil.NewServer(t)

	t.Run("records the completion time and ends the session", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := startSession(t, srv, token)
		bench := addExercise(t, srv, token, id, "Bench Press")
		logSet(t, srv, token, id, bench, 100, 5)

		res := finishSession(t, srv, token, id)

		started, finished := parseTime(t, res.Body["startedAt"]), parseTime(t, res.Body["finishedAt"])
		if finished.Before(started) || time.Since(finished) > time.Minute {
			t.Errorf("finishedAt = %v, want now, after startedAt %v", finished, started)
		}
		if got := sessionExercises(t, res); len(got) != 1 || len(objects(t, got[0], "sets")) != 1 {
			t.Errorf("exercises = %v, want Bench Press with its set", got)
		}
		current := testutil.Do(t, srv, http.MethodGet, "/workouts/sessions/current", token, nil)
		if current.Body["session"] != nil {
			t.Errorf("current = %v, want none in progress", current.Body)
		}
		startSession(t, srv, token) // A new one can start.
	})

	t.Run("refuses to finish a session with no sets", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := startSession(t, srv, token)
		addExercise(t, srv, token, id, "Bench Press")

		res := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions/"+id+"/finish", token, nil)

		if res.Status != http.StatusBadRequest || res.ErrorCode() != "session_empty" {
			t.Fatalf("got %d %q, want 400 session_empty", res.Status, res.ErrorCode())
		}
	})

	t.Run("refuses changes once finished", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := startSession(t, srv, token)
		bench := addExercise(t, srv, token, id, "Bench Press")
		logSet(t, srv, token, id, bench, 100, 5)
		finishSession(t, srv, token, id)

		for _, req := range []struct {
			method, path string
			body         any
		}{
			{http.MethodPost, "/workouts/sessions/" + id + "/finish", nil},
			{http.MethodPost, "/workouts/sessions/" + id + "/exercises", map[string]string{"exerciseId": exerciseID(t, srv, token, "Deadlift")}},
			{http.MethodPost, "/workouts/sessions/" + id + "/exercises/" + bench + "/sets", map[string]any{"weight": 100, "weightUnit": "kg", "reps": 5}},
		} {
			res := testutil.Do(t, srv, req.method, req.path, token, req.body)
			if res.Status != http.StatusConflict || res.ErrorCode() != "session_finished" {
				t.Errorf("%s %s: got %d %q, want 409 session_finished", req.method, req.path, res.Status, res.ErrorCode())
			}
		}
	})

	t.Run("refuses another user's session", func(t *testing.T) {
		_, _, owner := testutil.SignUp(t, srv)
		id := startSession(t, srv, owner)
		_, _, token := testutil.SignUp(t, srv)

		res := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions/"+id+"/finish", token, nil)

		if res.Status != http.StatusNotFound || res.ErrorCode() != "session_not_found" {
			t.Fatalf("got %d %q, want 404 session_not_found", res.Status, res.ErrorCode())
		}
	})
}

func TestDiscardSession(t *testing.T) {
	srv := testutil.NewServer(t)

	t.Run("deletes the session in progress", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := startSession(t, srv, token)
		addExercise(t, srv, token, id, "Bench Press")

		res := testutil.Do(t, srv, http.MethodDelete, "/workouts/sessions/"+id, token, nil)

		if res.Status != http.StatusNoContent {
			t.Fatalf("status = %d, want 204; body %v", res.Status, res.Body)
		}
		current := testutil.Do(t, srv, http.MethodGet, "/workouts/sessions/current", token, nil)
		if current.Body["session"] != nil {
			t.Errorf("current = %v, want none in progress", current.Body)
		}
	})

	t.Run("keeps finished sessions", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := startSession(t, srv, token)
		bench := addExercise(t, srv, token, id, "Bench Press")
		logSet(t, srv, token, id, bench, 100, 5)
		finishSession(t, srv, token, id)

		res := testutil.Do(t, srv, http.MethodDelete, "/workouts/sessions/"+id, token, nil)

		if res.Status != http.StatusConflict || res.ErrorCode() != "session_finished" {
			t.Fatalf("got %d %q, want 409 session_finished", res.Status, res.ErrorCode())
		}
	})

	t.Run("refuses another user's session", func(t *testing.T) {
		_, _, owner := testutil.SignUp(t, srv)
		id := startSession(t, srv, owner)
		_, _, token := testutil.SignUp(t, srv)

		res := testutil.Do(t, srv, http.MethodDelete, "/workouts/sessions/"+id, token, nil)

		if res.Status != http.StatusNotFound || res.ErrorCode() != "session_not_found" {
			t.Fatalf("got %d %q, want 404 session_not_found", res.Status, res.ErrorCode())
		}
	})
}

func TestSessionHistory(t *testing.T) {
	srv := testutil.NewServer(t)

	t.Run("lists the caller's finished sessions, newest first", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		older := startSession(t, srv, token)
		logSet(t, srv, token, older, addExercise(t, srv, token, older, "Back Squat"), 140, 5)
		finishSession(t, srv, token, older)
		newer := startSession(t, srv, token)
		logSet(t, srv, token, newer, addExercise(t, srv, token, newer, "Deadlift"), 180, 3)
		addExercise(t, srv, token, newer, "Pull-up")
		addExercise(t, srv, token, newer, "Deadlift") // Listed once.
		finishSession(t, srv, token, newer)
		startSession(t, srv, token) // In progress, so not history yet.
		_, _, other := testutil.SignUp(t, srv)
		otherID := startSession(t, srv, other)
		logSet(t, srv, other, otherID, addExercise(t, srv, other, otherID, "Plank"), 0, 1)
		finishSession(t, srv, other, otherID)

		res := testutil.Do(t, srv, http.MethodGet, "/workouts/sessions", token, nil)

		if res.Status != http.StatusOK {
			t.Fatalf("status = %d, want 200; body %v", res.Status, res.Body)
		}
		list := objects(t, res.Body, "sessions")
		if len(list) != 2 || list[0]["id"] != newer || list[1]["id"] != older {
			t.Fatalf("sessions = %v, want the newer then the older finished session", list)
		}
		if got := fmt.Sprint(list[0]["exerciseNames"]); got != "[Deadlift Pull-up]" {
			t.Errorf("exerciseNames = %s, want [Deadlift Pull-up]", got)
		}
		if parseTime(t, list[0]["finishedAt"]).Before(parseTime(t, list[0]["startedAt"])) {
			t.Errorf("session %v finished before it started", list[0])
		}
	})

	t.Run("is empty before any session is finished", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)

		res := testutil.Do(t, srv, http.MethodGet, "/workouts/sessions", token, nil)

		if list := objects(t, res.Body, "sessions"); len(list) != 0 {
			t.Fatalf("sessions = %v, want none", list)
		}
	})
}

func TestSuperset(t *testing.T) {
	srv := testutil.NewServer(t)

	t.Run("groups two exercises into a superset", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := startSession(t, srv, token)
		bench := addExercise(t, srv, token, id, "Bench Press")
		row := addExercise(t, srv, token, id, "Barbell Row")
		addExercise(t, srv, token, id, "Plank")

		res := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions/"+id+"/supersets", token,
			map[string]any{"sessionExerciseIds": []string{bench, row}})

		if res.Status != http.StatusCreated {
			t.Fatalf("status = %d, want 201; body %v", res.Status, res.Body)
		}
		got := sessionExercises(t, res)
		superset, _ := got[0]["supersetId"].(string)
		if superset == "" || got[1]["supersetId"] != superset {
			t.Errorf("supersetIds = %v, %v; want one shared id", got[0]["supersetId"], got[1]["supersetId"])
		}
		if v, ok := got[2]["supersetId"]; !ok || v != nil {
			t.Errorf("Plank supersetId = %v, want null", v)
		}
	})

	t.Run("groups three or more exercises into one superset", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := startSession(t, srv, token)
		ids := []string{
			addExercise(t, srv, token, id, "Bench Press"),
			addExercise(t, srv, token, id, "Barbell Row"),
			addExercise(t, srv, token, id, "Pull-up"),
			addExercise(t, srv, token, id, "Plank"),
		}

		res := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions/"+id+"/supersets", token,
			map[string]any{"sessionExerciseIds": ids})

		if res.Status != http.StatusCreated {
			t.Fatalf("status = %d, want 201; body %v", res.Status, res.Body)
		}
		got := sessionExercises(t, res)
		for _, e := range got {
			if e["supersetId"] == nil || e["supersetId"] != got[0]["supersetId"] {
				t.Fatalf("exercises = %v, want all four in one superset", got)
			}
		}
	})

	t.Run("keeps separate supersets apart", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := startSession(t, srv, token)
		a, b := addExercise(t, srv, token, id, "Bench Press"), addExercise(t, srv, token, id, "Barbell Row")
		c, d := addExercise(t, srv, token, id, "Back Squat"), addExercise(t, srv, token, id, "Pull-up")

		createSuperset(t, srv, token, id, a, b)
		res := createSuperset(t, srv, token, id, c, d)

		got := sessionExercises(t, res)
		if got[0]["supersetId"] == got[2]["supersetId"] || got[2]["supersetId"] != got[3]["supersetId"] {
			t.Fatalf("exercises = %v, want two separate supersets", got)
		}
	})

	for _, tc := range []struct {
		name string
		ids  func(bench, row string) any
	}{
		{"a single exercise", func(bench, _ string) any { return []string{bench} }},
		{"the same exercise twice", func(bench, _ string) any { return []string{bench, bench} }},
		{"no exercises", func(_, _ string) any { return []string{} }},
		{"a missing list", func(_, _ string) any { return nil }},
	} {
		t.Run("rejects "+tc.name, func(t *testing.T) {
			_, _, token := testutil.SignUp(t, srv)
			id := startSession(t, srv, token)
			bench := addExercise(t, srv, token, id, "Bench Press")
			row := addExercise(t, srv, token, id, "Barbell Row")

			res := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions/"+id+"/supersets", token,
				map[string]any{"sessionExerciseIds": tc.ids(bench, row)})

			if res.Status != http.StatusBadRequest || res.ErrorCode() != "invalid_superset" {
				t.Fatalf("got %d %q, want 400 invalid_superset", res.Status, res.ErrorCode())
			}
			if got := currentExercises(t, srv, token); got[0]["supersetId"] != nil {
				t.Errorf("exercises = %v, want none grouped", got)
			}
		})
	}

	t.Run("refuses an exercise already in a superset", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := startSession(t, srv, token)
		a, b := addExercise(t, srv, token, id, "Bench Press"), addExercise(t, srv, token, id, "Barbell Row")
		c := addExercise(t, srv, token, id, "Plank")
		createSuperset(t, srv, token, id, a, b)

		res := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions/"+id+"/supersets", token,
			map[string]any{"sessionExerciseIds": []string{b, c}})

		if res.Status != http.StatusConflict || res.ErrorCode() != "already_in_superset" {
			t.Fatalf("got %d %q, want 409 already_in_superset", res.Status, res.ErrorCode())
		}
		if got := currentExercises(t, srv, token); got[2]["supersetId"] != nil {
			t.Errorf("Plank = %v, want it left ungrouped", got[2])
		}
	})

	t.Run("refuses an exercise from another session", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		first := startSession(t, srv, token)
		old := addExercise(t, srv, token, first, "Bench Press")
		logSet(t, srv, token, first, old, 100, 5)
		finishSession(t, srv, token, first)
		second := startSession(t, srv, token)
		row := addExercise(t, srv, token, second, "Barbell Row")

		res := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions/"+second+"/supersets", token,
			map[string]any{"sessionExerciseIds": []string{old, row}})

		if res.Status != http.StatusNotFound || res.ErrorCode() != "session_exercise_not_found" {
			t.Fatalf("got %d %q, want 404 session_exercise_not_found", res.Status, res.ErrorCode())
		}
	})

	t.Run("records on each set the superset it was logged in", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := startSession(t, srv, token)
		bench, row := addExercise(t, srv, token, id, "Bench Press"), addExercise(t, srv, token, id, "Barbell Row")
		logSet(t, srv, token, id, bench, 100, 5) // Before grouping.
		superset := sessionExercises(t, createSuperset(t, srv, token, id, bench, row))[0]["supersetId"].(string)
		logSet(t, srv, token, id, bench, 100, 5)
		logSet(t, srv, token, id, row, 80, 8)

		res := testutil.Do(t, srv, http.MethodDelete, "/workouts/sessions/"+id+"/supersets/"+superset, token, nil)

		if res.Status != http.StatusOK {
			t.Fatalf("ungroup: status = %d, want 200; body %v", res.Status, res.Body)
		}
		logSet(t, srv, token, id, bench, 100, 5) // After ungrouping.
		got := currentExercises(t, srv, token)
		if got[0]["supersetId"] != nil || got[1]["supersetId"] != nil {
			t.Errorf("exercises = %v, want both ungrouped", got)
		}
		benchSets, rowSets := objects(t, got[0], "sets"), objects(t, got[1], "sets")
		for i, want := range []any{nil, superset, nil} {
			if v, ok := benchSets[i]["supersetId"]; !ok || v != want {
				t.Errorf("Bench Press set %d supersetId = %v, want %v", i+1, v, want)
			}
		}
		if rowSets[0]["supersetId"] != superset {
			t.Errorf("Barbell Row set supersetId = %v, want %s", rowSets[0]["supersetId"], superset)
		}
	})

	t.Run("refuses to ungroup an unknown superset", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := startSession(t, srv, token)

		res := testutil.Do(t, srv, http.MethodDelete, "/workouts/sessions/"+id+"/supersets/"+uuid.NewString(), token, nil)

		if res.Status != http.StatusNotFound || res.ErrorCode() != "superset_not_found" {
			t.Fatalf("got %d %q, want 404 superset_not_found", res.Status, res.ErrorCode())
		}
	})

	t.Run("refuses changes to a finished session", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := startSession(t, srv, token)
		bench, row := addExercise(t, srv, token, id, "Bench Press"), addExercise(t, srv, token, id, "Barbell Row")
		logSet(t, srv, token, id, bench, 100, 5)
		finishSession(t, srv, token, id)

		res := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions/"+id+"/supersets", token,
			map[string]any{"sessionExerciseIds": []string{bench, row}})

		if res.Status != http.StatusConflict || res.ErrorCode() != "session_finished" {
			t.Fatalf("got %d %q, want 409 session_finished", res.Status, res.ErrorCode())
		}
	})
}

func TestEditSet(t *testing.T) {
	srv := testutil.NewServer(t)

	t.Run("corrects a logged set in place, keeping its order and superset", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := startSession(t, srv, token)
		bench, row := addExercise(t, srv, token, id, "Bench Press"), addExercise(t, srv, token, id, "Barbell Row")
		superset := sessionExercises(t, createSuperset(t, srv, token, id, bench, row))[0]["supersetId"]
		logSet(t, srv, token, id, bench, 100, 5)
		logSet(t, srv, token, id, bench, 100, 5)
		setID := objects(t, currentExercises(t, srv, token)[0], "sets")[0]["id"].(string)
		testutil.Do(t, srv, http.MethodDelete, "/workouts/sessions/"+id+"/supersets/"+superset.(string), token, nil)

		res := testutil.Do(t, srv, http.MethodPatch, "/workouts/sessions/"+id+"/sets/"+setID, token, map[string]any{
			"weight": 105, "weightUnit": "lb", "reps": 4, "rpe": 9, "note": "  Fixed  ",
		})

		if res.Status != http.StatusOK {
			t.Fatalf("status = %d, want 200; body %v", res.Status, res.Body)
		}
		sets := objects(t, sessionExercises(t, res)[0], "sets")
		first := sets[0]
		if first["id"] != setID || first["weight"] != 105.0 || first["weightUnit"] != "lb" || first["reps"] != 4.0 ||
			first["rpe"] != 9.0 || first["note"] != "Fixed" {
			t.Errorf("first set = %v, want it corrected to 105 lb x 4 @ 9, noted", first)
		}
		if first["supersetId"] != superset {
			t.Errorf("supersetId = %v, want the superset it was logged in, %v", first["supersetId"], superset)
		}
		if len(sets) != 2 || sets[1]["reps"] != 5.0 {
			t.Errorf("sets = %v, want the second left as it was", sets)
		}
	})

	t.Run("clears the RPE when it's left blank", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := startSession(t, srv, token)
		bench := addExercise(t, srv, token, id, "Bench Press")
		res := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions/"+id+"/exercises/"+bench+"/sets", token,
			map[string]any{"weight": 100, "weightUnit": "kg", "reps": 5, "rpe": 8})
		setID := objects(t, sessionExercises(t, res)[0], "sets")[0]["id"].(string)

		res = testutil.Do(t, srv, http.MethodPatch, "/workouts/sessions/"+id+"/sets/"+setID, token,
			map[string]any{"weight": 100, "weightUnit": "kg", "reps": 5})

		if got := objects(t, sessionExercises(t, res)[0], "sets")[0]["rpe"]; got != nil {
			t.Fatalf("rpe = %v, want null", got)
		}
	})

	t.Run("validates the set as logging does", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := startSession(t, srv, token)
		setID := logOneSet(t, srv, token, id)

		res := testutil.Do(t, srv, http.MethodPatch, "/workouts/sessions/"+id+"/sets/"+setID, token,
			map[string]any{"weight": 100, "weightUnit": "kg", "reps": 0})

		if res.Status != http.StatusBadRequest || res.ErrorCode() != "invalid_reps" {
			t.Fatalf("got %d %q, want 400 invalid_reps", res.Status, res.ErrorCode())
		}
	})

	t.Run("refuses a set from another session", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		first := startSession(t, srv, token)
		setID := logOneSet(t, srv, token, first)
		finishSession(t, srv, token, first)
		second := startSession(t, srv, token)

		res := testutil.Do(t, srv, http.MethodPatch, "/workouts/sessions/"+second+"/sets/"+setID, token,
			map[string]any{"weight": 100, "weightUnit": "kg", "reps": 5})

		if res.Status != http.StatusNotFound || res.ErrorCode() != "set_not_found" {
			t.Fatalf("got %d %q, want 404 set_not_found", res.Status, res.ErrorCode())
		}
	})

	t.Run("refuses changes to a finished session", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := startSession(t, srv, token)
		setID := logOneSet(t, srv, token, id)
		finishSession(t, srv, token, id)

		res := testutil.Do(t, srv, http.MethodPatch, "/workouts/sessions/"+id+"/sets/"+setID, token,
			map[string]any{"weight": 100, "weightUnit": "kg", "reps": 5})

		if res.Status != http.StatusConflict || res.ErrorCode() != "session_finished" {
			t.Fatalf("got %d %q, want 409 session_finished", res.Status, res.ErrorCode())
		}
	})
}

func TestDeleteSet(t *testing.T) {
	srv := testutil.NewServer(t)

	t.Run("deletes a set, leaving the others in order", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := startSession(t, srv, token)
		bench := addExercise(t, srv, token, id, "Bench Press")
		for _, reps := range []int{5, 4, 3} {
			logSet(t, srv, token, id, bench, 100, reps)
		}
		middle := objects(t, currentExercises(t, srv, token)[0], "sets")[1]["id"].(string)

		res := testutil.Do(t, srv, http.MethodDelete, "/workouts/sessions/"+id+"/sets/"+middle, token, nil)

		if res.Status != http.StatusOK {
			t.Fatalf("status = %d, want 200; body %v", res.Status, res.Body)
		}
		sets := objects(t, sessionExercises(t, res)[0], "sets")
		if len(sets) != 2 || sets[0]["reps"] != 5.0 || sets[1]["reps"] != 3.0 {
			t.Fatalf("sets = %v, want the 5 and the 3 left", sets)
		}
	})

	t.Run("refuses an unknown set", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := startSession(t, srv, token)

		res := testutil.Do(t, srv, http.MethodDelete, "/workouts/sessions/"+id+"/sets/"+uuid.NewString(), token, nil)

		if res.Status != http.StatusNotFound || res.ErrorCode() != "set_not_found" {
			t.Fatalf("got %d %q, want 404 set_not_found", res.Status, res.ErrorCode())
		}
	})

	t.Run("never deletes another user's set", func(t *testing.T) {
		_, _, owner := testutil.SignUp(t, srv)
		ownerSession := startSession(t, srv, owner)
		setID := logOneSet(t, srv, owner, ownerSession)
		_, _, other := testutil.SignUp(t, srv)
		otherSession := startSession(t, srv, other)

		res := testutil.Do(t, srv, http.MethodDelete, "/workouts/sessions/"+otherSession+"/sets/"+setID, other, nil)

		if res.Status != http.StatusNotFound {
			t.Fatalf("status = %d, want 404", res.Status)
		}
		if got := objects(t, currentExercises(t, srv, owner)[0], "sets"); len(got) != 1 {
			t.Fatalf("owner's sets = %v, want theirs kept", got)
		}
	})

	t.Run("refuses changes to a finished session", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := startSession(t, srv, token)
		setID := logOneSet(t, srv, token, id)
		finishSession(t, srv, token, id)

		res := testutil.Do(t, srv, http.MethodDelete, "/workouts/sessions/"+id+"/sets/"+setID, token, nil)

		if res.Status != http.StatusConflict || res.ErrorCode() != "session_finished" {
			t.Fatalf("got %d %q, want 409 session_finished", res.Status, res.ErrorCode())
		}
	})
}

func TestStartSessionFromRoutine(t *testing.T) {
	srv := testutil.NewServer(t)

	t.Run("pre-populates the session with the routine's slots and their targets", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		routine := createRoutine(t, srv, token, map[string]any{
			"name": "Push day",
			"slots": []map[string]any{
				{"exerciseId": exerciseID(t, srv, token, "Bench Press"), "targetSets": 3, "targetReps": 5,
					"targetWeight": 100, "weightUnit": "kg", "restSeconds": 180, "note": "Pause on the chest"},
				{"exerciseId": exerciseID(t, srv, token, "Lat Pulldown"), "targetSets": 3, "targetReps": 10,
					"targetWeight": 120, "weightUnit": "lb", "supersetGroup": 1},
				{"exerciseId": exerciseID(t, srv, token, "Overhead Press"), "targetSets": 3, "targetReps": 8,
					"targetWeight": 40, "weightUnit": "kg", "supersetGroup": 1},
			},
		})

		res := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions", token, map[string]any{"routineId": routine})

		if res.Status != http.StatusCreated {
			t.Fatalf("status = %d, want 201; body %v", res.Status, res.Body)
		}
		if res.Body["routineId"] != routine {
			t.Errorf("routineId = %v, want %s", res.Body["routineId"], routine)
		}
		got := sessionExercises(t, res)
		if len(got) != 3 || got[0]["name"] != "Bench Press" || got[1]["name"] != "Lat Pulldown" ||
			got[2]["name"] != "Overhead Press" {
			t.Fatalf("exercises = %v, want Bench Press, Lat Pulldown, Overhead Press", got)
		}
		bench, _ := got[0]["target"].(map[string]any)
		if bench["sets"] != 3.0 || bench["reps"] != 5.0 || bench["weight"] != 100.0 || bench["weightUnit"] != "kg" ||
			bench["restSeconds"] != 180.0 || bench["note"] != "Pause on the chest" {
			t.Errorf("Bench Press target = %v, want 3 x 5 at 100 kg, 3 min rest, noted", got[0]["target"])
		}
		if got[0]["note"] != "" || len(objects(t, got[0], "sets")) != 0 {
			t.Errorf("Bench Press = %v, want no note or sets yet", got[0])
		}
		if pulldown, _ := got[1]["target"].(map[string]any); pulldown["weightUnit"] != "lb" || pulldown["restSeconds"] != nil {
			t.Errorf("Lat Pulldown target = %v, want in lb with no rest", got[1]["target"])
		}
		if got[0]["supersetId"] != nil || got[1]["supersetId"] == nil || got[1]["supersetId"] != got[2]["supersetId"] {
			t.Errorf("supersets = %v, %v, %v; want Lat Pulldown and Overhead Press in one",
				got[0]["supersetId"], got[1]["supersetId"], got[2]["supersetId"])
		}
	})

	t.Run("a freeform session has no routine or targets", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := startSession(t, srv, token)

		addExercise(t, srv, token, id, "Deadlift")

		res := testutil.Do(t, srv, http.MethodGet, "/workouts/sessions/current", token, nil)
		session := res.Body["session"].(map[string]any)
		if v, ok := session["routineId"]; !ok || v != nil {
			t.Errorf("routineId = %v, want null", v)
		}
		if v, ok := objects(t, session, "exercises")[0]["target"]; !ok || v != nil {
			t.Errorf("target = %v, want null", v)
		}
	})

	t.Run("logs actual sets alongside the planned target", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		routine := createRoutine(t, srv, token, map[string]any{"name": "Push day", "slots": []map[string]any{
			{"exerciseId": exerciseID(t, srv, token, "Bench Press"), "targetSets": 3, "targetReps": 5,
				"targetWeight": 100, "weightUnit": "kg"},
		}})
		res := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions", token, map[string]any{"routineId": routine})
		id, bench := res.Body["id"].(string), sessionExercises(t, res)[0]["id"].(string)

		res = testutil.Do(t, srv, http.MethodPost, "/workouts/sessions/"+id+"/exercises/"+bench+"/sets", token,
			map[string]any{"weight": 97.5, "weightUnit": "kg", "reps": 6, "rpe": 9})

		if res.Status != http.StatusCreated {
			t.Fatalf("status = %d, want 201; body %v", res.Status, res.Body)
		}
		exercise := sessionExercises(t, res)[0]
		target, _ := exercise["target"].(map[string]any)
		sets := objects(t, exercise, "sets")
		if target["weight"] != 100.0 || target["reps"] != 5.0 {
			t.Errorf("target = %v, want 100 kg x 5", target)
		}
		if len(sets) != 1 || sets[0]["weight"] != 97.5 || sets[0]["reps"] != 6.0 || sets[0]["rpe"] != 9.0 {
			t.Errorf("sets = %v, want 97.5 kg x 6 @ 9", sets)
		}
	})

	t.Run("keeps the targets it started with when the routine is edited or deleted", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		bench := map[string]any{"exerciseId": exerciseID(t, srv, token, "Bench Press"), "targetSets": 3,
			"targetReps": 5, "targetWeight": 100, "weightUnit": "kg"}
		routine := createRoutine(t, srv, token, map[string]any{"name": "Push day", "slots": []any{bench}})
		testutil.Do(t, srv, http.MethodPost, "/workouts/sessions", token, map[string]any{"routineId": routine})

		bench["targetWeight"] = 110
		if res := testutil.Do(t, srv, http.MethodPut, "/routines/"+routine, token,
			map[string]any{"name": "Push day", "slots": []any{bench}}); res.Status != http.StatusOK {
			t.Fatalf("edit routine: status %d, body %v", res.Status, res.Body)
		}
		if target, _ := currentExercises(t, srv, token)[0]["target"].(map[string]any); target["weight"] != 100.0 {
			t.Errorf("target after edit = %v, want still 100 kg", target)
		}

		testutil.Do(t, srv, http.MethodDelete, "/routines/"+routine, token, nil)
		res := testutil.Do(t, srv, http.MethodGet, "/workouts/sessions/current", token, nil)
		session := res.Body["session"].(map[string]any)
		if session["routineId"] != nil {
			t.Errorf("routineId after delete = %v, want null", session["routineId"])
		}
		if target, _ := objects(t, session, "exercises")[0]["target"].(map[string]any); target["weight"] != 100.0 {
			t.Errorf("target after delete = %v, want still 100 kg", target)
		}
	})

	t.Run("refuses another user's routine", func(t *testing.T) {
		_, _, owner := testutil.SignUp(t, srv)
		routine := createRoutine(t, srv, owner, map[string]any{"name": "Push day", "slots": []map[string]any{
			{"exerciseId": exerciseID(t, srv, owner, "Bench Press"), "targetSets": 3, "targetReps": 5,
				"targetWeight": 100, "weightUnit": "kg"},
		}})
		_, _, token := testutil.SignUp(t, srv)

		res := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions", token, map[string]any{"routineId": routine})

		if res.Status != http.StatusNotFound || res.ErrorCode() != "routine_not_found" {
			t.Fatalf("got %d %q, want 404 routine_not_found", res.Status, res.ErrorCode())
		}
	})

	t.Run("refuses while another session is in progress", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		routine := createRoutine(t, srv, token, map[string]any{"name": "Push day", "slots": []map[string]any{
			{"exerciseId": exerciseID(t, srv, token, "Bench Press"), "targetSets": 3, "targetReps": 5,
				"targetWeight": 100, "weightUnit": "kg"},
		}})
		startSession(t, srv, token)

		res := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions", token, map[string]any{"routineId": routine})

		if res.Status != http.StatusConflict || res.ErrorCode() != "session_in_progress" {
			t.Fatalf("got %d %q, want 409 session_in_progress", res.Status, res.ErrorCode())
		}
	})
}

func TestSaveSessionAsRoutine(t *testing.T) {
	srv := testutil.NewServer(t)

	t.Run("saves a finished session's logged exercises as a new routine", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := startSession(t, srv, token)
		bench := addExercise(t, srv, token, id, "Bench Press")
		logSet(t, srv, token, id, bench, 100, 5)
		logSet(t, srv, token, id, bench, 105, 3)
		addExercise(t, srv, token, id, "Deadlift") // No sets: left out.
		pulldown := addExercise(t, srv, token, id, "Lat Pulldown")
		press := addExercise(t, srv, token, id, "Overhead Press")
		createSuperset(t, srv, token, id, pulldown, press)
		logSet(t, srv, token, id, pulldown, 60, 10)
		logSet(t, srv, token, id, press, 40, 8)
		finishSession(t, srv, token, id)

		res := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions/"+id+"/routine", token,
			map[string]any{"name": " Saturday push "})

		if res.Status != http.StatusCreated {
			t.Fatalf("status = %d, want 201; body %v", res.Status, res.Body)
		}
		if res.Body["name"] != "Saturday push" {
			t.Errorf("name = %v, want Saturday push", res.Body["name"])
		}
		slots := objects(t, res.Body, "slots")
		if len(slots) != 3 || slots[0]["name"] != "Bench Press" || slots[1]["name"] != "Lat Pulldown" ||
			slots[2]["name"] != "Overhead Press" {
			t.Fatalf("slots = %v, want Bench Press, Lat Pulldown, Overhead Press", slots)
		}
		// The target is as many sets as were logged, at the last set's weight and reps.
		if b := slots[0]; b["targetSets"] != 2.0 || b["targetReps"] != 3.0 || b["targetWeight"] != 105.0 ||
			b["weightUnit"] != "kg" || b["supersetGroup"] != nil {
			t.Errorf("Bench Press slot = %v, want 2 x 3 at 105 kg, in no superset", b)
		}
		if slots[1]["supersetGroup"] != 1.0 || slots[2]["supersetGroup"] != 1.0 {
			t.Errorf("superset groups = %v, %v; want both 1", slots[1]["supersetGroup"], slots[2]["supersetGroup"])
		}

		list := testutil.Do(t, srv, http.MethodGet, "/routines", token, nil)
		if routines := objects(t, list.Body, "routines"); len(routines) != 1 || routines[0]["id"] != res.Body["id"] {
			t.Errorf("routines = %v, want the new one", routines)
		}
	})

	t.Run("refuses a session still in progress", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := startSession(t, srv, token)
		logOneSet(t, srv, token, id)

		res := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions/"+id+"/routine", token,
			map[string]any{"name": "Too soon"})

		if res.Status != http.StatusConflict || res.ErrorCode() != "session_not_finished" {
			t.Fatalf("got %d %q, want 409 session_not_finished", res.Status, res.ErrorCode())
		}
	})

	t.Run("refuses a blank name", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := startSession(t, srv, token)
		logOneSet(t, srv, token, id)
		finishSession(t, srv, token, id)

		res := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions/"+id+"/routine", token,
			map[string]any{"name": " "})

		if res.Status != http.StatusBadRequest || res.ErrorCode() != "invalid_name" {
			t.Fatalf("got %d %q, want 400 invalid_name", res.Status, res.ErrorCode())
		}
	})

	t.Run("refuses another user's session", func(t *testing.T) {
		_, _, owner := testutil.SignUp(t, srv)
		id := startSession(t, srv, owner)
		logOneSet(t, srv, owner, id)
		finishSession(t, srv, owner, id)
		_, _, token := testutil.SignUp(t, srv)

		res := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions/"+id+"/routine", token,
			map[string]any{"name": "Mine now"})

		if res.Status != http.StatusNotFound || res.ErrorCode() != "session_not_found" {
			t.Fatalf("got %d %q, want 404 session_not_found", res.Status, res.ErrorCode())
		}
	})
}

// createRoutine creates a routine from body and returns its id.
func createRoutine(t *testing.T, srv *httptest.Server, token string, body map[string]any) string {
	t.Helper()
	res := testutil.Do(t, srv, http.MethodPost, "/routines", token, body)
	if res.Status != http.StatusCreated {
		t.Fatalf("create routine: status %d, body %v", res.Status, res.Body)
	}
	return res.Body["id"].(string)
}

// logOneSet adds Bench Press to a session, logs 100 kg x 5 and returns the
// set's id.
func logOneSet(t *testing.T, srv *httptest.Server, token, sessionID string) string {
	t.Helper()
	bench := addExercise(t, srv, token, sessionID, "Bench Press")
	res := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions/"+sessionID+"/exercises/"+bench+"/sets", token,
		map[string]any{"weight": 100, "weightUnit": "kg", "reps": 5})
	if res.Status != http.StatusCreated {
		t.Fatalf("log set: status %d, body %v", res.Status, res.Body)
	}
	exercises := sessionExercises(t, res)
	sets := objects(t, exercises[len(exercises)-1], "sets") // Bench Press, just added.
	return sets[len(sets)-1]["id"].(string)
}

func createSuperset(t *testing.T, srv *httptest.Server, token, sessionID string, sessionExerciseIDs ...string) testutil.Response {
	t.Helper()
	res := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions/"+sessionID+"/supersets", token,
		map[string]any{"sessionExerciseIds": sessionExerciseIDs})
	if res.Status != http.StatusCreated {
		t.Fatalf("create superset: status %d, body %v", res.Status, res.Body)
	}
	return res
}

// currentExercises returns the exercises of the caller's session in progress.
func currentExercises(t *testing.T, srv *httptest.Server, token string) []map[string]any {
	t.Helper()
	res := testutil.Do(t, srv, http.MethodGet, "/workouts/sessions/current", token, nil)
	session, ok := res.Body["session"].(map[string]any)
	if !ok {
		t.Fatalf("no session in progress: %v", res.Body)
	}
	return objects(t, session, "exercises")
}

// startSession starts a session and returns its id.
func startSession(t *testing.T, srv *httptest.Server, token string) string {
	t.Helper()
	res := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions", token, nil)
	if res.Status != http.StatusCreated {
		t.Fatalf("start session: status %d, body %v", res.Status, res.Body)
	}
	return res.Body["id"].(string)
}

// exerciseID looks up a library exercise's id by its exact name.
func exerciseID(t *testing.T, srv *httptest.Server, token, name string) string {
	t.Helper()
	res := testutil.Do(t, srv, http.MethodGet, "/exercises?q="+url.QueryEscape(name), token, nil)
	for _, e := range objects(t, res.Body, "exercises") {
		if e["name"] == name {
			return e["id"].(string)
		}
	}
	t.Fatalf("no exercise named %q", name)
	return ""
}

func createCustomExercise(t *testing.T, srv *httptest.Server, token, name string) string {
	t.Helper()
	res := testutil.Do(t, srv, http.MethodPost, "/exercises", token, map[string]string{
		"name": name, "muscleGroup": "quads", "equipmentType": "machine",
	})
	if res.Status != http.StatusCreated {
		t.Fatalf("create exercise: status %d, body %v", res.Status, res.Body)
	}
	return res.Body["id"].(string)
}

// addExercise adds a library exercise to a session and returns the new
// session exercise's id.
func addExercise(t *testing.T, srv *httptest.Server, token, sessionID, name string) string {
	t.Helper()
	res := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions/"+sessionID+"/exercises", token,
		map[string]string{"exerciseId": exerciseID(t, srv, token, name)})
	if res.Status != http.StatusCreated {
		t.Fatalf("add exercise: status %d, body %v", res.Status, res.Body)
	}
	list := sessionExercises(t, res)
	return list[len(list)-1]["id"].(string)
}

// logSet logs a set of weight kg x reps.
func logSet(t *testing.T, srv *httptest.Server, token, sessionID, sessionExerciseID string, weight float64, reps int) {
	t.Helper()
	res := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions/"+sessionID+"/exercises/"+sessionExerciseID+"/sets", token,
		map[string]any{"weight": weight, "weightUnit": "kg", "reps": reps})
	if res.Status != http.StatusCreated {
		t.Fatalf("log set: status %d, body %v", res.Status, res.Body)
	}
}

func finishSession(t *testing.T, srv *httptest.Server, token, sessionID string) testutil.Response {
	t.Helper()
	res := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions/"+sessionID+"/finish", token, nil)
	if res.Status != http.StatusOK {
		t.Fatalf("finish session: status %d, body %v", res.Status, res.Body)
	}
	return res
}

func parseTime(t *testing.T, v any) time.Time {
	t.Helper()
	s, _ := v.(string)
	got, err := time.Parse(time.RFC3339Nano, s)
	if err != nil {
		t.Fatalf("not an RFC 3339 time: %v", v)
	}
	return got
}

// sessionExercises returns the "exercises" array of a session response.
func sessionExercises(t *testing.T, res testutil.Response) []map[string]any {
	t.Helper()
	return objects(t, res.Body, "exercises")
}

// objects returns body[key] as a list of JSON objects.
func objects(t *testing.T, body map[string]any, key string) []map[string]any {
	t.Helper()
	raw, ok := body[key].([]any)
	if !ok {
		t.Fatalf("no %s array in %v", key, body)
	}
	out := make([]map[string]any, len(raw))
	for i, e := range raw {
		out[i] = e.(map[string]any)
	}
	return out
}
