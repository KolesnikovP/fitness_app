package feed_test

import (
	"image/color"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/KolesnikovP/fitness_app/backend/internal/testutil"
)

func TestPost(t *testing.T) {
	srv := testutil.NewServer(t)

	t.Run("a finished session has a post, with no photo or caption yet and the session's stats", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := logWorkout(t, srv, token, "Bench Press", set{100, 5}, set{100, 5})

		res := testutil.Do(t, srv, http.MethodGet, "/posts/"+id, token, nil)
		if res.Status != http.StatusOK {
			t.Fatalf("get post: status %d, body %v", res.Status, res.Body)
		}
		if res.Body["id"] != id || res.Body["caption"] != "" || res.Body["photoUrl"] != nil {
			t.Errorf("post = %v, want id %s, empty caption, no photo", res.Body, id)
		}
		stats := object(t, object(t, res.Body, "session"), "stats")
		if stats["volume"] != 1000.0 || stats["setCount"] != 2.0 {
			t.Errorf("stats = %v, want volume 1000 over 2 sets", stats)
		}
	})

	t.Run("a caption can be set, changed and cleared", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := logWorkout(t, srv, token, "Bench Press", set{100, 5})

		for _, caption := range []string{"Felt strong 💪", "Heavy day", ""} {
			res := testutil.Do(t, srv, http.MethodPatch, "/posts/"+id, token, map[string]string{"caption": caption})
			if res.Status != http.StatusOK || res.Body["caption"] != caption {
				t.Fatalf("set caption %q: status %d, body %v", caption, res.Status, res.Body)
			}
			if got := testutil.Do(t, srv, http.MethodGet, "/posts/"+id, token, nil).Body["caption"]; got != caption {
				t.Errorf("after setting %q, GET caption = %v", caption, got)
			}
		}
	})

	t.Run("a request without a caption is refused, not taken as clearing it", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := logWorkout(t, srv, token, "Bench Press", set{100, 5})
		testutil.Do(t, srv, http.MethodPatch, "/posts/"+id, token, map[string]string{"caption": "Kept"})

		res := testutil.Do(t, srv, http.MethodPatch, "/posts/"+id, token, map[string]string{})

		if res.Status != http.StatusBadRequest || res.ErrorCode() != "missing_caption" {
			t.Errorf("no caption: status %d, code %q; want 400 missing_caption", res.Status, res.ErrorCode())
		}
		if got := getPost(t, srv, token, id)["caption"]; got != "Kept" {
			t.Errorf("caption = %v, want it kept", got)
		}
	})

	t.Run("a caption is at most 2,200 characters", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := logWorkout(t, srv, token, "Bench Press", set{100, 5})

		// Counted in characters, not bytes: 2,200 emoji are allowed.
		longest := strings.Repeat("💪", 2200)
		if res := testutil.Do(t, srv, http.MethodPatch, "/posts/"+id, token, map[string]string{"caption": longest}); res.Status != http.StatusOK {
			t.Errorf("2,200-character caption: status %d, body %v; want 200", res.Status, res.Body)
		}
		res := testutil.Do(t, srv, http.MethodPatch, "/posts/"+id, token, map[string]string{"caption": longest + "!"})
		if res.Status != http.StatusBadRequest || res.ErrorCode() != "caption_too_long" {
			t.Errorf("2,201-character caption: status %d, code %q; want 400 caption_too_long", res.Status, res.ErrorCode())
		}
		if got := testutil.Do(t, srv, http.MethodGet, "/posts/"+id, token, nil).Body["caption"]; got != longest {
			t.Errorf("a refused caption changed the post")
		}
	})

	t.Run("shows its session's stats and records as they are now, after a set is corrected", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		logWorkout(t, srv, token, "Bench Press", set{100, 5})
		id := logWorkout(t, srv, token, "Bench Press", set{110, 5})
		if got := len(objects(t, object(t, getPost(t, srv, token, id), "session"), "personalRecords")); got == 0 {
			t.Fatalf("before the correction the post has no records; want the 110 kg set's")
		}

		// Sets in a finished Session can't be corrected through the API yet
		// (#17), so the typo is fixed in the database.
		testutil.Pool(t).Exec(t.Context(), `UPDATE session_sets SET weight = 90
			WHERE session_exercise_id IN (SELECT id FROM session_exercises WHERE session_id = $1)`, id)

		session := object(t, getPost(t, srv, token, id), "session")
		if v := object(t, session, "stats")["volume"]; v != 450.0 {
			t.Errorf("volume = %v, want 450 after correcting the set to 90 kg × 5", v)
		}
		if got := objects(t, session, "personalRecords"); len(got) != 0 {
			t.Errorf("records = %v, want none once the set is short of 100 kg", got)
		}
	})

	t.Run("another user's post and photo stay hidden, and can't be changed", func(t *testing.T) {
		_, _, mine := testutil.SignUp(t, srv)
		_, _, theirs := testutil.SignUp(t, srv)
		id := logWorkout(t, srv, mine, "Bench Press", set{100, 5})
		testutil.Do(t, srv, http.MethodPatch, "/posts/"+id, mine, map[string]string{"caption": "mine"})
		url := uploadPhoto(t, srv, mine, id, pngBytes(t, color.RGBA{R: 255, A: 255})).Body["photoUrl"].(string)

		for _, res := range []testutil.Response{
			testutil.Do(t, srv, http.MethodGet, "/posts/"+id, theirs, nil),
			testutil.Do(t, srv, http.MethodPatch, "/posts/"+id, theirs, map[string]string{"caption": "theirs"}),
			uploadPhoto(t, srv, theirs, id, pngBytes(t, color.RGBA{G: 255, A: 255})),
			testutil.Do(t, srv, http.MethodDelete, "/posts/"+id+"/photo", theirs, nil),
		} {
			if res.Status != http.StatusNotFound || res.ErrorCode() != "post_not_found" {
				t.Errorf("their request: status %d, code %q; want 404 post_not_found", res.Status, res.ErrorCode())
			}
		}
		if status, _, _ := fetch(t, srv, theirs, url); status != http.StatusNotFound {
			t.Errorf("their GET photoUrl: status %d, want 404", status)
		}
		post := getPost(t, srv, mine, id)
		if post["caption"] != "mine" || post["photoUrl"] != url {
			t.Errorf("after their attempts my post is %v", post)
		}
	})

	t.Run("a session in progress has no post yet", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := startSession(t, srv, token)

		res := testutil.Do(t, srv, http.MethodGet, "/posts/"+id, token, nil)
		if res.Status != http.StatusNotFound || res.ErrorCode() != "post_not_found" {
			t.Errorf("get post: status %d, code %q; want 404 post_not_found", res.Status, res.ErrorCode())
		}
	})
}

func getPost(t *testing.T, srv *httptest.Server, token, id string) map[string]any {
	t.Helper()
	res := testutil.Do(t, srv, http.MethodGet, "/posts/"+id, token, nil)
	if res.Status != http.StatusOK {
		t.Fatalf("get post: status %d, body %v", res.Status, res.Body)
	}
	return res.Body
}

type set struct {
	weight float64
	reps   int
}

// logWorkout starts a session, logs sets of one exercise in kg, finishes it
// and returns its id.
func logWorkout(t *testing.T, srv *httptest.Server, token, exercise string, sets ...set) string {
	t.Helper()
	id := startSession(t, srv, token)
	res := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions/"+id+"/exercises", token,
		map[string]string{"exerciseId": exerciseID(t, srv, token, exercise)})
	if res.Status != http.StatusCreated {
		t.Fatalf("add exercise: status %d, body %v", res.Status, res.Body)
	}
	list := objects(t, res.Body, "exercises")
	sessionExerciseID := list[len(list)-1]["id"].(string)
	for _, s := range sets {
		res := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions/"+id+"/exercises/"+sessionExerciseID+"/sets",
			token, map[string]any{"weight": s.weight, "weightUnit": "kg", "reps": s.reps})
		if res.Status != http.StatusCreated {
			t.Fatalf("log set: status %d, body %v", res.Status, res.Body)
		}
	}
	if res := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions/"+id+"/finish", token, nil); res.Status != http.StatusOK {
		t.Fatalf("finish session: status %d, body %v", res.Status, res.Body)
	}
	return id
}

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

func object(t *testing.T, body map[string]any, key string) map[string]any {
	t.Helper()
	o, ok := body[key].(map[string]any)
	if !ok {
		t.Fatalf("no %s object in %v", key, body)
	}
	return o
}

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
