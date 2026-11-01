package program_test

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/KolesnikovP/fitness_app/backend/internal/testutil"
)

func TestCreateRoutine(t *testing.T) {
	srv := testutil.NewServer(t)

	t.Run("creates a routine with its slots in order", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)

		res := testutil.Do(t, srv, http.MethodPost, "/routines", token, map[string]any{
			"name": "  Push day ",
			"slots": []map[string]any{
				{"exerciseId": exerciseID(t, srv, token, "Bench Press"), "targetSets": 3, "targetReps": 5,
					"targetWeight": 100, "weightUnit": "kg", "restSeconds": 180, "note": " Pause on the chest "},
				{"exerciseId": exerciseID(t, srv, token, "Overhead Press"), "targetSets": 4, "targetReps": 8,
					"targetWeight": 95, "weightUnit": "lb"},
			},
		})

		if res.Status != http.StatusCreated {
			t.Fatalf("status = %d, want 201; body %v", res.Status, res.Body)
		}
		if res.Body["id"] == nil || res.Body["name"] != "Push day" {
			t.Errorf("routine = %v, want an id and the trimmed name", res.Body)
		}
		slots := objects(t, res.Body, "slots")
		if len(slots) != 2 {
			t.Fatalf("slots = %v, want 2", slots)
		}
		bench, press := slots[0], slots[1]
		if bench["name"] != "Bench Press" || bench["targetSets"] != 3.0 || bench["targetReps"] != 5.0 ||
			bench["targetWeight"] != 100.0 || bench["weightUnit"] != "kg" || bench["restSeconds"] != 180.0 ||
			bench["note"] != "Pause on the chest" || bench["supersetGroup"] != nil {
			t.Errorf("first slot = %v, want Bench Press 3 x 5 at 100 kg, 3 min rest, noted", bench)
		}
		if press["name"] != "Overhead Press" || press["targetSets"] != 4.0 || press["targetWeight"] != 95.0 ||
			press["weightUnit"] != "lb" || press["restSeconds"] != nil || press["note"] != "" {
			t.Errorf("second slot = %v, want Overhead Press 4 x 8 at 95 lb, no rest or note", press)
		}
	})

	t.Run("groups slots into supersets, numbered in routine order", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)

		res := testutil.Do(t, srv, http.MethodPost, "/routines", token, map[string]any{
			"name": "Pull day",
			"slots": []map[string]any{
				slot(t, srv, token, "Deadlift", nil),
				slot(t, srv, token, "Lat Pulldown", 7),
				slot(t, srv, token, "Bench Press", 3),
				slot(t, srv, token, "Overhead Press", 7),
				slot(t, srv, token, "Back Squat", 3),
			},
		})

		if res.Status != http.StatusCreated {
			t.Fatalf("status = %d, want 201; body %v", res.Status, res.Body)
		}
		var groups []any
		for _, s := range objects(t, res.Body, "slots") {
			groups = append(groups, s["supersetGroup"])
		}
		want := []any{nil, 1.0, 2.0, 1.0, 2.0}
		if fmt.Sprint(groups) != fmt.Sprint(want) {
			t.Errorf("supersetGroups = %v, want %v", groups, want)
		}
	})

	t.Run("refuses what it can't save", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		bench := func(change map[string]any) map[string]any {
			s := slot(t, srv, token, "Bench Press", nil)
			for k, v := range change {
				s[k] = v
			}
			return s
		}
		_, _, other := testutil.SignUp(t, srv)
		othersExercise := createCustomExercise(t, srv, other, "Belt Squat")

		cases := []struct {
			name   string
			body   map[string]any
			status int
			code   string
		}{
			{"blank name", map[string]any{"name": "  ", "slots": []any{bench(nil)}}, 400, "invalid_name"},
			{"no slots", map[string]any{"name": "Empty", "slots": []any{}}, 400, "invalid_slots"},
			{"no target sets", map[string]any{"name": "R", "slots": []any{bench(map[string]any{"targetSets": nil})}}, 400, "invalid_target_sets"},
			{"too many sets", map[string]any{"name": "R", "slots": []any{bench(map[string]any{"targetSets": 21})}}, 400, "invalid_target_sets"},
			{"zero reps", map[string]any{"name": "R", "slots": []any{bench(map[string]any{"targetReps": 0})}}, 400, "invalid_target_reps"},
			{"no weight", map[string]any{"name": "R", "slots": []any{bench(map[string]any{"targetWeight": nil})}}, 400, "invalid_target_weight"},
			{"bad unit", map[string]any{"name": "R", "slots": []any{bench(map[string]any{"weightUnit": "st"})}}, 400, "invalid_weight_unit"},
			{"zero rest", map[string]any{"name": "R", "slots": []any{bench(map[string]any{"restSeconds": 0})}}, 400, "invalid_rest"},
			{"superset of one", map[string]any{"name": "R", "slots": []any{bench(map[string]any{"supersetGroup": 1}), bench(nil)}}, 400, "invalid_superset"},
			{"another user's exercise", map[string]any{"name": "R", "slots": []any{bench(map[string]any{"exerciseId": othersExercise})}}, 404, "exercise_not_found"},
		}
		for _, c := range cases {
			res := testutil.Do(t, srv, http.MethodPost, "/routines", token, c.body)
			if res.Status != c.status || res.ErrorCode() != c.code {
				t.Errorf("%s: got %d %q, want %d %q", c.name, res.Status, res.ErrorCode(), c.status, c.code)
			}
		}
	})

	t.Run("requires a login", func(t *testing.T) {
		res := testutil.Do(t, srv, http.MethodPost, "/routines", "", map[string]any{"name": "R"})

		if res.Status != http.StatusUnauthorized {
			t.Fatalf("status = %d, want 401", res.Status)
		}
	})
}

func TestBrowseRoutines(t *testing.T) {
	srv := testutil.NewServer(t)

	t.Run("lists the caller's routines by name, with their exercises", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		createRoutine(t, srv, token, "Push day", "Bench Press", "Overhead Press")
		createRoutine(t, srv, token, "legs", "Back Squat")
		_, _, other := testutil.SignUp(t, srv)
		createRoutine(t, srv, other, "Not mine", "Deadlift")

		res := testutil.Do(t, srv, http.MethodGet, "/routines", token, nil)

		if res.Status != http.StatusOK {
			t.Fatalf("status = %d, want 200; body %v", res.Status, res.Body)
		}
		routines := objects(t, res.Body, "routines")
		if len(routines) != 2 || routines[0]["name"] != "legs" || routines[1]["name"] != "Push day" {
			t.Fatalf("routines = %v, want legs then Push day", routines)
		}
		if got := fmt.Sprint(routines[1]["exerciseNames"]); got != "[Bench Press Overhead Press]" {
			t.Errorf("Push day exercises = %s, want Bench Press and Overhead Press", got)
		}
	})

	t.Run("lists none for a new user", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)

		res := testutil.Do(t, srv, http.MethodGet, "/routines", token, nil)

		if routines := objects(t, res.Body, "routines"); len(routines) != 0 {
			t.Fatalf("routines = %v, want none", routines)
		}
	})

	t.Run("gets one routine with its slots", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := createRoutine(t, srv, token, "Push day", "Bench Press", "Overhead Press")

		res := testutil.Do(t, srv, http.MethodGet, "/routines/"+id, token, nil)

		if res.Status != http.StatusOK || res.Body["name"] != "Push day" {
			t.Fatalf("got %d %v, want Push day", res.Status, res.Body)
		}
		if slots := objects(t, res.Body, "slots"); len(slots) != 2 || slots[1]["name"] != "Overhead Press" {
			t.Errorf("slots = %v, want Bench Press then Overhead Press", slots)
		}
	})

	t.Run("never shows another user's routine", func(t *testing.T) {
		_, _, owner := testutil.SignUp(t, srv)
		id := createRoutine(t, srv, owner, "Push day", "Bench Press")
		_, _, token := testutil.SignUp(t, srv)

		res := testutil.Do(t, srv, http.MethodGet, "/routines/"+id, token, nil)

		if res.Status != http.StatusNotFound || res.ErrorCode() != "routine_not_found" {
			t.Fatalf("got %d %q, want 404 routine_not_found", res.Status, res.ErrorCode())
		}
	})
}

func TestEditRoutine(t *testing.T) {
	srv := testutil.NewServer(t)

	t.Run("replaces the name and slots", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := createRoutine(t, srv, token, "Push day", "Bench Press", "Overhead Press")
		press := slot(t, srv, token, "Overhead Press", nil)
		press["targetSets"] = 5

		res := testutil.Do(t, srv, http.MethodPut, "/routines/"+id, token, map[string]any{
			"name":  "Push day B",
			"slots": []any{press, slot(t, srv, token, "Dumbbell Bench Press", nil)},
		})

		if res.Status != http.StatusOK {
			t.Fatalf("status = %d, want 200; body %v", res.Status, res.Body)
		}
		got := testutil.Do(t, srv, http.MethodGet, "/routines/"+id, token, nil)
		if got.Body["name"] != "Push day B" {
			t.Errorf("name = %v, want Push day B", got.Body["name"])
		}
		slots := objects(t, got.Body, "slots")
		if len(slots) != 2 || slots[0]["name"] != "Overhead Press" || slots[0]["targetSets"] != 5.0 ||
			slots[1]["name"] != "Dumbbell Bench Press" {
			t.Errorf("slots = %v, want Overhead Press 5 sets, then Dumbbell Bench Press", slots)
		}
	})

	t.Run("refuses an invalid edit and keeps the routine as it was", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := createRoutine(t, srv, token, "Push day", "Bench Press")

		res := testutil.Do(t, srv, http.MethodPut, "/routines/"+id, token, map[string]any{"name": "Push", "slots": []any{}})

		if res.Status != http.StatusBadRequest || res.ErrorCode() != "invalid_slots" {
			t.Fatalf("got %d %q, want 400 invalid_slots", res.Status, res.ErrorCode())
		}
		got := testutil.Do(t, srv, http.MethodGet, "/routines/"+id, token, nil)
		if got.Body["name"] != "Push day" || len(objects(t, got.Body, "slots")) != 1 {
			t.Errorf("routine = %v, want it unchanged", got.Body)
		}
	})

	t.Run("refuses another user's routine", func(t *testing.T) {
		_, _, owner := testutil.SignUp(t, srv)
		id := createRoutine(t, srv, owner, "Push day", "Bench Press")
		_, _, token := testutil.SignUp(t, srv)

		res := testutil.Do(t, srv, http.MethodPut, "/routines/"+id, token, map[string]any{
			"name": "Mine now", "slots": []any{slot(t, srv, token, "Deadlift", nil)},
		})

		if res.Status != http.StatusNotFound || res.ErrorCode() != "routine_not_found" {
			t.Fatalf("got %d %q, want 404 routine_not_found", res.Status, res.ErrorCode())
		}
	})
}

func TestDeleteRoutine(t *testing.T) {
	srv := testutil.NewServer(t)

	t.Run("deletes the routine", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := createRoutine(t, srv, token, "Push day", "Bench Press")

		res := testutil.Do(t, srv, http.MethodDelete, "/routines/"+id, token, nil)

		if res.Status != http.StatusNoContent {
			t.Fatalf("status = %d, want 204; body %v", res.Status, res.Body)
		}
		if got := testutil.Do(t, srv, http.MethodGet, "/routines/"+id, token, nil); got.Status != http.StatusNotFound {
			t.Errorf("get after delete: status %d, want 404", got.Status)
		}
	})

	t.Run("refuses another user's routine", func(t *testing.T) {
		_, _, owner := testutil.SignUp(t, srv)
		id := createRoutine(t, srv, owner, "Push day", "Bench Press")
		_, _, token := testutil.SignUp(t, srv)

		res := testutil.Do(t, srv, http.MethodDelete, "/routines/"+id, token, nil)

		if res.Status != http.StatusNotFound || res.ErrorCode() != "routine_not_found" {
			t.Fatalf("got %d %q, want 404 routine_not_found", res.Status, res.ErrorCode())
		}
		if got := testutil.Do(t, srv, http.MethodGet, "/routines/"+id, owner, nil); got.Status != http.StatusOK {
			t.Errorf("owner's routine: status %d, want it kept", got.Status)
		}
	})
}

func TestSlotSubstitutes(t *testing.T) {
	srv := testutil.NewServer(t)

	t.Run("saves a slot's substitutes in order, with their names", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		bench := slot(t, srv, token, "Bench Press", nil)
		bench["substituteIds"] = []string{
			exerciseID(t, srv, token, "Dumbbell Bench Press"), exerciseID(t, srv, token, "Push-up"),
		}

		res := testutil.Do(t, srv, http.MethodPost, "/routines", token, map[string]any{
			"name": "Push day", "slots": []any{bench, slot(t, srv, token, "Overhead Press", nil)},
		})

		if res.Status != http.StatusCreated {
			t.Fatalf("status = %d, want 201; body %v", res.Status, res.Body)
		}
		got := testutil.Do(t, srv, http.MethodGet, "/routines/"+res.Body["id"].(string), token, nil)
		slots := objects(t, got.Body, "slots")
		subs := objects(t, slots[0], "substitutes")
		if len(subs) != 2 || subs[0]["name"] != "Dumbbell Bench Press" || subs[1]["name"] != "Push-up" ||
			subs[0]["exerciseId"] != bench["substituteIds"].([]string)[0] {
			t.Errorf("Bench Press substitutes = %v, want Dumbbell Bench Press, then Push-up", subs)
		}
		if press := objects(t, slots[1], "substitutes"); len(press) != 0 {
			t.Errorf("Overhead Press substitutes = %v, want none", press)
		}
	})

	t.Run("replaces them when the routine is edited", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		bench := slot(t, srv, token, "Bench Press", nil)
		bench["substituteIds"] = []string{exerciseID(t, srv, token, "Push-up")}
		id := testutil.Do(t, srv, http.MethodPost, "/routines", token, map[string]any{
			"name": "Push day", "slots": []any{bench},
		}).Body["id"].(string)
		bench["substituteIds"] = []string{exerciseID(t, srv, token, "Cable Crossover")}

		res := testutil.Do(t, srv, http.MethodPut, "/routines/"+id, token, map[string]any{
			"name": "Push day", "slots": []any{bench},
		})

		if res.Status != http.StatusOK {
			t.Fatalf("status = %d, want 200; body %v", res.Status, res.Body)
		}
		subs := objects(t, objects(t, res.Body, "slots")[0], "substitutes")
		if len(subs) != 1 || subs[0]["name"] != "Cable Crossover" {
			t.Errorf("substitutes = %v, want only Cable Crossover", subs)
		}
	})

	t.Run("refuses substitutes it can't save", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		_, _, other := testutil.SignUp(t, srv)
		benchID := exerciseID(t, srv, token, "Bench Press")
		pushUp := exerciseID(t, srv, token, "Push-up")
		tooMany := make([]string, 11)
		for i := range tooMany {
			tooMany[i] = exerciseID(t, srv, token, "Push-up")
		}
		cases := []struct {
			name   string
			ids    any
			status int
			code   string
		}{
			{"the slot's own exercise", []string{benchID}, 400, "invalid_substitutes"},
			{"the same one twice", []string{pushUp, pushUp}, 400, "invalid_substitutes"},
			{"more than ten", tooMany, 400, "invalid_substitutes"},
			{"not an id", []string{"nope"}, 404, "exercise_not_found"},
			{"another user's exercise", []string{createCustomExercise(t, srv, other, "Hack Squat")}, 404, "exercise_not_found"},
		}
		for _, c := range cases {
			bench := slot(t, srv, token, "Bench Press", nil)
			bench["substituteIds"] = c.ids
			res := testutil.Do(t, srv, http.MethodPost, "/routines", token, map[string]any{"name": "R", "slots": []any{bench}})
			if res.Status != c.status || res.ErrorCode() != c.code {
				t.Errorf("%s: got %d %q, want %d %q", c.name, res.Status, res.ErrorCode(), c.status, c.code)
			}
		}
	})
}

// createRoutine creates a routine of the named library exercises, each
// 3 x 10 at 50 kg, and returns its id.
func createRoutine(t *testing.T, srv *httptest.Server, token, name string, exercises ...string) string {
	t.Helper()
	slots := make([]any, len(exercises))
	for i, e := range exercises {
		slots[i] = slot(t, srv, token, e, nil)
	}
	res := testutil.Do(t, srv, http.MethodPost, "/routines", token, map[string]any{"name": name, "slots": slots})
	if res.Status != http.StatusCreated {
		t.Fatalf("create routine: status %d, body %v", res.Status, res.Body)
	}
	return res.Body["id"].(string)
}

// slot is an Exercise slot of the named library exercise, 3 x 10 at 50 kg,
// in supersetGroup if it isn't nil.
func slot(t *testing.T, srv *httptest.Server, token, name string, supersetGroup any) map[string]any {
	t.Helper()
	return map[string]any{
		"exerciseId": exerciseID(t, srv, token, name), "targetSets": 3, "targetReps": 10,
		"targetWeight": 50, "weightUnit": "kg", "supersetGroup": supersetGroup,
	}
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
