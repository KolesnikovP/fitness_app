package feed_test

import (
	"bytes"
	"image/color"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/KolesnikovP/fitness_app/backend/internal/testutil"
)

func TestProgressPhoto(t *testing.T) {
	srv := testutil.NewServer(t)

	t.Run("a photo set on a post is served back from photoUrl", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := logWorkout(t, srv, token, "Bench Press", set{100, 5})
		photo := pngBytes(t, color.RGBA{R: 255, A: 255})

		res := uploadPhoto(t, srv, token, id, photo)

		url, _ := res.Body["photoUrl"].(string)
		if res.Status != http.StatusOK || url == "" {
			t.Fatalf("upload: status %d, body %v; want 200 with a photoUrl", res.Status, res.Body)
		}
		if got := testutil.Do(t, srv, http.MethodGet, "/posts/"+id, token, nil).Body["photoUrl"]; got != url {
			t.Errorf("GET post photoUrl = %v, want %q", got, url)
		}
		status, contentType, data := fetch(t, srv, token, url)
		if status != http.StatusOK || contentType != "image/png" || !bytes.Equal(data, photo) {
			t.Errorf("GET photoUrl: %d %q, %d bytes; want 200 image/png with the uploaded bytes", status, contentType, len(data))
		}
	})

	t.Run("a new photo replaces the old one under a new URL, and the caption stays", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := logWorkout(t, srv, token, "Bench Press", set{100, 5})
		testutil.Do(t, srv, http.MethodPatch, "/posts/"+id, token, map[string]string{"caption": "Leg day"})
		first := uploadPhoto(t, srv, token, id, pngBytes(t, color.RGBA{R: 255, A: 255})).Body["photoUrl"]
		second := pngBytes(t, color.RGBA{B: 255, A: 255})

		res := uploadPhoto(t, srv, token, id, second)

		if res.Body["photoUrl"] == first || res.Body["caption"] != "Leg day" {
			t.Fatalf("after replacing: %v; want a new photoUrl and the caption kept", res.Body)
		}
		if _, _, data := fetch(t, srv, token, res.Body["photoUrl"].(string)); !bytes.Equal(data, second) {
			t.Errorf("served the old photo after replacing it")
		}
	})

	t.Run("a removed photo is gone", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := logWorkout(t, srv, token, "Bench Press", set{100, 5})
		uploadPhoto(t, srv, token, id, pngBytes(t, color.RGBA{R: 255, A: 255}))

		res := testutil.Do(t, srv, http.MethodDelete, "/posts/"+id+"/photo", token, nil)

		if res.Status != http.StatusOK || res.Body["photoUrl"] != nil {
			t.Fatalf("remove photo: status %d, body %v; want 200 with no photoUrl", res.Status, res.Body)
		}
		if status, _, _ := fetch(t, srv, token, "/posts/"+id+"/photo"); status != http.StatusNotFound {
			t.Errorf("GET photo after removing: status %d, want 404", status)
		}
	})

	t.Run("rejects files that are not PNG, JPEG or WebP", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := logWorkout(t, srv, token, "Bench Press", set{100, 5})

		res := uploadPhoto(t, srv, token, id, []byte("just some text, not an image"))

		if res.Status != http.StatusUnsupportedMediaType || res.ErrorCode() != "unsupported_media_type" {
			t.Errorf("got %d %q, want 415 unsupported_media_type", res.Status, res.ErrorCode())
		}
	})

	t.Run("rejects photos over 10 MB", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := logWorkout(t, srv, token, "Bench Press", set{100, 5})
		big := append(pngBytes(t, color.RGBA{R: 255, A: 255}), make([]byte, 10<<20)...)

		res := uploadPhoto(t, srv, token, id, big)

		if res.Status != http.StatusRequestEntityTooLarge || res.ErrorCode() != "media_too_large" {
			t.Errorf("got %d %q, want 413 media_too_large", res.Status, res.ErrorCode())
		}
	})
}

func pngBytes(t *testing.T, fill color.Color) []byte {
	t.Helper()
	return testutil.PNG(t, fill)
}

// uploadPhoto PUTs data as a Post's Progress photo.
func uploadPhoto(t *testing.T, srv *httptest.Server, token, postID string, data []byte) testutil.Response {
	t.Helper()
	return testutil.Upload(t, srv, token, "/posts/"+postID+"/photo", data)
}

func fetch(t *testing.T, srv *httptest.Server, token, path string) (int, string, []byte) {
	t.Helper()
	return testutil.Fetch(t, srv, token, path)
}
