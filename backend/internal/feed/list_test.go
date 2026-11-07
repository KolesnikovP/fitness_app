package feed_test

import (
	"fmt"
	"image/color"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/KolesnikovP/fitness_app/backend/internal/testutil"
)

func TestListPosts(t *testing.T) {
	srv := testutil.NewServer(t)

	t.Run("is empty before any workout is finished", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		startSession(t, srv, token)

		if got := listPosts(t, srv, token); len(got) != 0 {
			t.Fatalf("posts = %v, want none", got)
		}
	})

	t.Run("lists the caller's Posts newest first, with their photos, captions and Sessions", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		older := logWorkout(t, srv, token, "Bench Press", set{100, 5})
		newer := logWorkout(t, srv, token, "Bench Press", set{105, 5}, set{100, 5})
		photo := uploadPhoto(t, srv, token, older, testutil.PNG(t, color.RGBA{R: 255, A: 255})).Body["photoUrl"]
		testutil.Do(t, srv, http.MethodPatch, "/posts/"+newer, token, map[string]string{"caption": "Heavy day"})
		startSession(t, srv, token) // In progress, so no Post yet.
		_, _, other := testutil.SignUp(t, srv)
		logWorkout(t, srv, other, "Bench Press", set{60, 5})

		posts := listPosts(t, srv, token)

		if len(posts) != 2 || posts[0]["id"] != newer || posts[1]["id"] != older {
			t.Fatalf("posts = %v, want the newer then the older workout", posts)
		}
		if posts[0]["caption"] != "Heavy day" || posts[0]["photoUrl"] != nil {
			t.Errorf("newer post = %v, want its caption and no photo", posts[0])
		}
		if posts[1]["caption"] != "" || posts[1]["photoUrl"] != photo {
			t.Errorf("older post = %v, want no caption and photo %v", posts[1], photo)
		}
		session := object(t, posts[0], "session")
		stats := object(t, session, "stats")
		got := fmt.Sprintf("%v %v %v kg, %v sets, %d records", session["id"], session["exerciseNames"], stats["volume"],
			stats["setCount"], len(objects(t, session, "personalRecords")))
		if want := newer + " [Bench Press] 1025 kg, 2 sets, 2 records"; got != want {
			t.Errorf("newer post's session = %s, want %s", got, want)
		}
	})
}

func listPosts(t *testing.T, srv *httptest.Server, token string) []map[string]any {
	t.Helper()
	res := testutil.Do(t, srv, http.MethodGet, "/posts", token, nil)
	if res.Status != http.StatusOK {
		t.Fatalf("GET /posts: status %d, body %v", res.Status, res.Body)
	}
	return objects(t, res.Body, "posts")
}
