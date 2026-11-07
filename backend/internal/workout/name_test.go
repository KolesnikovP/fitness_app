package workout_test

import (
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"

	"github.com/KolesnikovP/fitness_app/backend/internal/testutil"
)

// freeformName is the shape of a freeform Session's name.
var freeformName = regexp.MustCompile(`^(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day's (Morning|Afternoon|Evening|Night) Workout$`)

func TestSessionName(t *testing.T) {
	srv := testutil.NewServer(t)

	t.Run("a session from a routine is named after it", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		routine := createRoutine(t, srv, token, benchRoutine(t, srv, token, "Push day"))

		res := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions", token, map[string]any{"routineId": routine})

		if res.Status != http.StatusCreated || res.Body["name"] != "Push day" {
			t.Fatalf("got %d, name %v; want 201 named Push day", res.Status, res.Body["name"])
		}
	})

	t.Run("a session from a routine with a long name gets its first 60 characters", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		long := strings.Repeat("é", 100)
		routine := createRoutine(t, srv, token, benchRoutine(t, srv, token, long))

		res := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions", token, map[string]any{"routineId": routine})

		if res.Body["name"] != strings.Repeat("é", 60) {
			t.Fatalf("name = %v, want the routine's first 60 characters", res.Body["name"])
		}
	})

	t.Run("a freeform session is named for the weekday and part of the day it started, where the user is", func(t *testing.T) {
		_, _, east := testutil.SignUp(t, srv)
		_, _, west := testutil.SignUp(t, srv)

		// UTC+14 and UTC-11 are always a day or more apart.
		inKiribati := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions", east,
			map[string]any{"timeZone": "Pacific/Kiritimati"}).Body["name"]
		inSamoa := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions", west,
			map[string]any{"timeZone": "Pacific/Pago_Pago"}).Body["name"]

		for _, name := range []any{inKiribati, inSamoa} {
			if s, _ := name.(string); !freeformName.MatchString(s) {
				t.Errorf("name = %v, want like Thursday's Morning Workout", name)
			}
		}
		if inKiribati == inSamoa {
			t.Errorf("both named %v, want each in its own time zone", inKiribati)
		}
	})

	t.Run("a freeform session started without a time zone, or an unknown one, is named in UTC", func(t *testing.T) {
		for _, body := range []any{nil, map[string]any{"timeZone": "Mars/Olympus_Mons"}} {
			_, _, token := testutil.SignUp(t, srv)
			res := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions", token, body)
			if s, _ := res.Body["name"].(string); res.Status != http.StatusCreated || !freeformName.MatchString(s) {
				t.Errorf("body %v: got %d, name %v; want 201 like Thursday's Morning Workout", body, res.Status, res.Body["name"])
			}
		}
	})

	t.Run("a session can be renamed, in progress or finished, and History shows the name", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := startSession(t, srv, token)

		res := rename(t, srv, token, id, "  Leg day  ")
		if res.Status != http.StatusOK || res.Body["name"] != "Leg day" {
			t.Fatalf("rename in progress: got %d, name %v; want 200 Leg day", res.Status, res.Body["name"])
		}
		logOneSet(t, srv, token, id)
		finishSession(t, srv, token, id)
		res = rename(t, srv, token, id, "Heavy legs 🦵")
		if res.Status != http.StatusOK || res.Body["name"] != "Heavy legs 🦵" {
			t.Fatalf("rename finished: got %d, name %v; want 200 Heavy legs 🦵", res.Status, res.Body["name"])
		}

		if got := sessionName(t, srv, token, id); got != "Heavy legs 🦵" {
			t.Errorf("GET name = %v, want Heavy legs 🦵", got)
		}
		history := objects(t, testutil.Do(t, srv, http.MethodGet, "/workouts/sessions", token, nil).Body, "sessions")
		if history[0]["name"] != "Heavy legs 🦵" {
			t.Errorf("History name = %v, want Heavy legs 🦵", history[0]["name"])
		}
		post := testutil.Do(t, srv, http.MethodGet, "/posts/"+id, token, nil).Body
		if session, _ := post["session"].(map[string]any); session["name"] != "Heavy legs 🦵" {
			t.Errorf("Post's session name = %v, want Heavy legs 🦵", post["session"])
		}
	})

	t.Run("a name is at most 60 characters", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := startSession(t, srv, token)

		// Counted in characters, not bytes.
		longest := strings.Repeat("💪", 60)
		if res := rename(t, srv, token, id, longest); res.Status != http.StatusOK {
			t.Errorf("60 characters: status %d, body %v; want 200", res.Status, res.Body)
		}
		res := rename(t, srv, token, id, longest+"!")
		if res.Status != http.StatusBadRequest || res.ErrorCode() != "name_too_long" {
			t.Errorf("61 characters: got %d %q, want 400 name_too_long", res.Status, res.ErrorCode())
		}
		if got := sessionName(t, srv, token, id); got != longest {
			t.Errorf("a refused name changed the session to %v", got)
		}
	})

	t.Run("cleared, a name goes back to the one it was given", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		routine := createRoutine(t, srv, token, benchRoutine(t, srv, token, "Push day"))
		id := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions", token,
			map[string]any{"routineId": routine}).Body["id"].(string)
		rename(t, srv, token, id, "Chest only")

		res := rename(t, srv, token, id, "   ")

		if res.Status != http.StatusOK || res.Body["name"] != "Push day" {
			t.Fatalf("cleared: got %d, name %v; want 200 Push day", res.Status, res.Body["name"])
		}
	})

	t.Run("a request without a name is refused, not taken as clearing it", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := startSession(t, srv, token)
		rename(t, srv, token, id, "Kept")

		res := testutil.Do(t, srv, http.MethodPatch, "/workouts/sessions/"+id, token, map[string]any{})

		if res.Status != http.StatusBadRequest || res.ErrorCode() != "missing_name" {
			t.Errorf("got %d %q, want 400 missing_name", res.Status, res.ErrorCode())
		}
		if got := sessionName(t, srv, token, id); got != "Kept" {
			t.Errorf("name = %v, want it kept", got)
		}
	})

	t.Run("renaming a session leaves its routine's name, and renaming the routine leaves its sessions'", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		body := benchRoutine(t, srv, token, "Push day")
		routine := createRoutine(t, srv, token, body)
		renamed := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions", token,
			map[string]any{"routineId": routine}).Body["id"].(string)
		rename(t, srv, token, renamed, "Chest only")
		logOneSet(t, srv, token, renamed)
		finishSession(t, srv, token, renamed)
		kept := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions", token,
			map[string]any{"routineId": routine}).Body["id"].(string)

		if got := testutil.Do(t, srv, http.MethodGet, "/routines/"+routine, token, nil).Body["name"]; got != "Push day" {
			t.Errorf("routine name = %v after renaming a session, want Push day", got)
		}
		body["name"] = "Upper A"
		if res := testutil.Do(t, srv, http.MethodPut, "/routines/"+routine, token, body); res.Status != http.StatusOK {
			t.Fatalf("rename routine: status %d, body %v", res.Status, res.Body)
		}
		if got := sessionName(t, srv, token, kept); got != "Push day" {
			t.Errorf("session name = %v after renaming its routine, want still Push day", got)
		}
		if got := rename(t, srv, token, kept, "").Body["name"]; got != "Push day" {
			t.Errorf("cleared after the routine's renamed: name = %v, want Push day, the name it was given", got)
		}
		if got := sessionName(t, srv, token, renamed); got != "Chest only" {
			t.Errorf("renamed session = %v, want still Chest only", got)
		}
	})

	t.Run("another user's session can't be renamed", func(t *testing.T) {
		_, _, owner := testutil.SignUp(t, srv)
		id := startSession(t, srv, owner)
		rename(t, srv, owner, id, "Mine")
		_, _, other := testutil.SignUp(t, srv)

		res := rename(t, srv, other, id, "Theirs")

		if res.Status != http.StatusNotFound || res.ErrorCode() != "session_not_found" {
			t.Errorf("got %d %q, want 404 session_not_found", res.Status, res.ErrorCode())
		}
		if got := sessionName(t, srv, owner, id); got != "Mine" {
			t.Errorf("name = %v, want still Mine", got)
		}
	})
}

func rename(t *testing.T, srv *httptest.Server, token, id, name string) testutil.Response {
	t.Helper()
	return testutil.Do(t, srv, http.MethodPatch, "/workouts/sessions/"+id, token, map[string]any{"name": name})
}

func sessionName(t *testing.T, srv *httptest.Server, token, id string) any {
	t.Helper()
	return testutil.Do(t, srv, http.MethodGet, "/workouts/sessions/"+id, token, nil).Body["name"]
}

// benchRoutine is a routine called name of one Bench Press slot, to create
// or replace it with.
func benchRoutine(t *testing.T, srv *httptest.Server, token, name string) map[string]any {
	t.Helper()
	return map[string]any{"name": name, "slots": []map[string]any{
		{"exerciseId": exerciseID(t, srv, token, "Bench Press"), "targetSets": 3, "targetReps": 5,
			"targetWeight": 100, "weightUnit": "kg"},
	}}
}
