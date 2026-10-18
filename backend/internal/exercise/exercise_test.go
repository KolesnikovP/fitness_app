package exercise_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"

	"github.com/KolesnikovP/fitness_app/backend/internal/testutil"
)

// exercises returns the "exercises" array from a list response.
func exercises(t *testing.T, res testutil.Response) []map[string]any {
	t.Helper()
	raw, ok := res.Body["exercises"].([]any)
	if !ok {
		t.Fatalf("no exercises array in %v", res.Body)
	}
	out := make([]map[string]any, len(raw))
	for i, e := range raw {
		out[i] = e.(map[string]any)
	}
	return out
}

func names(list []map[string]any) []string {
	out := make([]string, len(list))
	for i, e := range list {
		out[i], _ = e["name"].(string)
	}
	return out
}

func find(list []map[string]any, name string) map[string]any {
	for _, e := range list {
		if e["name"] == name {
			return e
		}
	}
	return nil
}

func TestListExercises(t *testing.T) {
	srv := testutil.NewServer(t)

	t.Run("lists the canonical library, sorted by name", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)

		res := testutil.Do(t, srv, http.MethodGet, "/exercises", token, nil)

		if res.Status != http.StatusOK {
			t.Fatalf("status = %d, want 200; body %v", res.Status, res.Body)
		}
		list := exercises(t, res)
		if len(list) < 30 {
			t.Fatalf("got %d exercises, want a starter library of at least 30", len(list))
		}
		bench := find(list, "Bench Press")
		if bench == nil {
			t.Fatalf("Bench Press missing from %v", names(list))
		}
		if bench["muscleGroup"] != "chest" || bench["equipmentType"] != "barbell" || bench["isCustom"] != false {
			t.Errorf("Bench Press = %v, want chest/barbell canonical", bench)
		}
		for i := 1; i < len(list); i++ {
			if names(list)[i-1] > names(list)[i] {
				t.Fatalf("not sorted by name: %q before %q", names(list)[i-1], names(list)[i])
			}
		}
	})

	t.Run("searches by part of the name, ignoring case", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)

		res := testutil.Do(t, srv, http.MethodGet, "/exercises?q=BENCH", token, nil)

		got := names(exercises(t, res))
		want := []string{"Bench Press", "Dumbbell Bench Press", "Incline Bench Press"}
		if !slices.Equal(got, want) {
			t.Fatalf("q=BENCH: got %v, want %v", got, want)
		}
	})

	t.Run("treats wildcard characters in the search as plain text", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)

		res := testutil.Do(t, srv, http.MethodGet, "/exercises?q=%25", token, nil)

		if got := names(exercises(t, res)); len(got) != 0 {
			t.Fatalf(`q="%%": got %v, want no matches`, got)
		}
	})

	t.Run("filters by muscle group and equipment type together", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)

		res := testutil.Do(t, srv, http.MethodGet, "/exercises?muscleGroup=back&equipmentType=cable", token, nil)

		got := names(exercises(t, res))
		want := []string{"Lat Pulldown", "Seated Cable Row"}
		if !slices.Equal(got, want) {
			t.Fatalf("back+cable: got %v, want %v", got, want)
		}
	})

	t.Run("combines the name search with a filter", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)

		res := testutil.Do(t, srv, http.MethodGet, "/exercises?q=press&equipmentType=dumbbell", token, nil)

		got := names(exercises(t, res))
		want := []string{"Dumbbell Bench Press", "Dumbbell Shoulder Press", "Incline Dumbbell Press"}
		if !slices.Equal(got, want) {
			t.Fatalf("press+dumbbell: got %v, want %v", got, want)
		}
	})

	for _, tc := range []struct{ query, code string }{
		{"muscleGroup=wings", "invalid_muscle_group"},
		{"equipmentType=spaceship", "invalid_equipment_type"},
	} {
		t.Run("rejects an unknown filter value: "+tc.query, func(t *testing.T) {
			_, _, token := testutil.SignUp(t, srv)

			res := testutil.Do(t, srv, http.MethodGet, "/exercises?"+tc.query, token, nil)

			if res.Status != http.StatusBadRequest || res.ErrorCode() != tc.code {
				t.Fatalf("got %d %q, want 400 %s", res.Status, res.ErrorCode(), tc.code)
			}
		})
	}

	t.Run("requires a token", func(t *testing.T) {
		res := testutil.Do(t, srv, http.MethodGet, "/exercises", "", nil)

		if res.Status != http.StatusUnauthorized {
			t.Fatalf("status = %d, want 401", res.Status)
		}
	})
}

// createExercise creates a custom exercise and returns it.
func createExercise(t *testing.T, srv *httptest.Server, token, name, muscleGroup, equipmentType string) map[string]any {
	t.Helper()
	res := testutil.Do(t, srv, http.MethodPost, "/exercises", token, map[string]string{
		"name": name, "muscleGroup": muscleGroup, "equipmentType": equipmentType,
	})
	if res.Status != http.StatusCreated {
		t.Fatalf("create %q: status %d, body %v", name, res.Status, res.Body)
	}
	return res.Body
}

func TestCreateCustomExercise(t *testing.T) {
	srv := testutil.NewServer(t)

	t.Run("returns the new custom exercise", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)

		created := createExercise(t, srv, token, "  Landmine Press  ", "shoulders", "barbell")

		if created["name"] != "Landmine Press" || created["muscleGroup"] != "shoulders" ||
			created["equipmentType"] != "barbell" || created["isCustom"] != true {
			t.Errorf("created = %v, want trimmed custom Landmine Press, shoulders/barbell", created)
		}
		if created["id"] == "" || created["imageUrl"] != nil || created["animatedDemoUrl"] != nil {
			t.Errorf("created = %v, want an id and no media", created)
		}
	})

	t.Run("appears in the creator's library alongside canonical exercises", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		createExercise(t, srv, token, "Belt Squat", "quads", "machine")

		res := testutil.Do(t, srv, http.MethodGet, "/exercises?muscleGroup=quads&equipmentType=machine", token, nil)

		got := names(exercises(t, res))
		want := []string{"Belt Squat", "Leg Extension", "Leg Press"}
		if !slices.Equal(got, want) {
			t.Fatalf("got %v, want %v", got, want)
		}
	})

	t.Run("is hidden from other users", func(t *testing.T) {
		_, _, mine := testutil.SignUp(t, srv)
		_, _, theirs := testutil.SignUp(t, srv)
		createExercise(t, srv, mine, "Secret Sled Push", "full_body", "other")

		res := testutil.Do(t, srv, http.MethodGet, "/exercises?q=sled", theirs, nil)

		if got := names(exercises(t, res)); len(got) != 0 {
			t.Fatalf("other user sees %v, want nothing", got)
		}
	})

	t.Run("search matches a percent sign literally", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		createExercise(t, srv, token, "50% Pause Squat", "quads", "barbell")

		res := testutil.Do(t, srv, http.MethodGet, "/exercises?q=50%25", token, nil)

		if got := names(exercises(t, res)); !slices.Equal(got, []string{"50% Pause Squat"}) {
			t.Fatalf(`q="50%%": got %v`, got)
		}
	})

	for _, tc := range []struct {
		desc string
		body map[string]string
		code string
	}{
		{"blank name", map[string]string{"name": "   ", "muscleGroup": "chest", "equipmentType": "barbell"}, "invalid_name"},
		{"name over 100 characters", map[string]string{"name": strings.Repeat("a", 101), "muscleGroup": "chest", "equipmentType": "barbell"}, "invalid_name"},
		{"missing muscle group", map[string]string{"name": "Thing", "equipmentType": "barbell"}, "invalid_muscle_group"},
		{"unknown equipmentType", map[string]string{"name": "Thing", "muscleGroup": "chest", "equipmentType": "rock"}, "invalid_equipment_type"},
	} {
		t.Run("rejects "+tc.desc, func(t *testing.T) {
			_, _, token := testutil.SignUp(t, srv)

			res := testutil.Do(t, srv, http.MethodPost, "/exercises", token, tc.body)

			if res.Status != http.StatusBadRequest || res.ErrorCode() != tc.code {
				t.Fatalf("got %d %q, want 400 %s", res.Status, res.ErrorCode(), tc.code)
			}
		})
	}

	t.Run("treats a token whose account is gone as logged out", func(t *testing.T) {
		email, _, token := testutil.SignUp(t, srv)
		if _, err := testutil.Pool(t).Exec(context.Background(), "DELETE FROM accounts WHERE email = $1", email); err != nil {
			t.Fatalf("delete account: %v", err)
		}

		res := testutil.Do(t, srv, http.MethodPost, "/exercises", token, map[string]string{
			"name": "Orphan", "muscleGroup": "chest", "equipmentType": "barbell",
		})

		if res.Status != http.StatusUnauthorized {
			t.Fatalf("status = %d, want 401", res.Status)
		}
	})

	t.Run("requires a token", func(t *testing.T) {
		res := testutil.Do(t, srv, http.MethodPost, "/exercises", "", map[string]string{
			"name": "Thing", "muscleGroup": "chest", "equipmentType": "barbell",
		})

		if res.Status != http.StatusUnauthorized {
			t.Fatalf("status = %d, want 401", res.Status)
		}
	})
}

func TestGetExercise(t *testing.T) {
	srv := testutil.NewServer(t)

	t.Run("returns a canonical exercise", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		deadlift := find(exercises(t, testutil.Do(t, srv, http.MethodGet, "/exercises?q=deadlift", token, nil)), "Deadlift")

		res := testutil.Do(t, srv, http.MethodGet, "/exercises/"+deadlift["id"].(string), token, nil)

		if res.Status != http.StatusOK {
			t.Fatalf("status = %d, want 200; body %v", res.Status, res.Body)
		}
		if res.Body["name"] != "Deadlift" || res.Body["muscleGroup"] != "back" ||
			res.Body["equipmentType"] != "barbell" || res.Body["isCustom"] != false {
			t.Errorf("got %v, want Deadlift back/barbell canonical", res.Body)
		}
	})

	t.Run("returns the caller's own custom exercise", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		created := createExercise(t, srv, token, "Zercher Squat", "quads", "barbell")

		res := testutil.Do(t, srv, http.MethodGet, "/exercises/"+created["id"].(string), token, nil)

		if res.Status != http.StatusOK || res.Body["name"] != "Zercher Squat" || res.Body["isCustom"] != true {
			t.Fatalf("got %d %v", res.Status, res.Body)
		}
	})

	t.Run("hides another user's custom exercise", func(t *testing.T) {
		_, _, mine := testutil.SignUp(t, srv)
		_, _, theirs := testutil.SignUp(t, srv)
		created := createExercise(t, srv, mine, "Private Move", "abs", "other")

		res := testutil.Do(t, srv, http.MethodGet, "/exercises/"+created["id"].(string), theirs, nil)

		if res.Status != http.StatusNotFound || res.ErrorCode() != "exercise_not_found" {
			t.Fatalf("got %d %q, want 404 exercise_not_found", res.Status, res.ErrorCode())
		}
	})

	for _, id := range []string{"00000000-0000-0000-0000-000000000000", "not-a-uuid"} {
		t.Run("404s for an unknown id: "+id, func(t *testing.T) {
			_, _, token := testutil.SignUp(t, srv)

			res := testutil.Do(t, srv, http.MethodGet, "/exercises/"+id, token, nil)

			if res.Status != http.StatusNotFound || res.ErrorCode() != "exercise_not_found" {
				t.Fatalf("got %d %q, want 404 exercise_not_found", res.Status, res.ErrorCode())
			}
		})
	}
}
