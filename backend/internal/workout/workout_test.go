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
