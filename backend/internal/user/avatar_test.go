package user_test

import (
	"bytes"
	"image/color"
	"net/http"
	"testing"

	"github.com/KolesnikovP/fitness_app/backend/internal/testutil"
)

func TestAvatar(t *testing.T) {
	srv := testutil.NewServer(t)

	t.Run("a new User has no avatar", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)

		res := testutil.Do(t, srv, http.MethodGet, "/users/me", token, nil)

		if avatar, present := res.Body["avatarUrl"]; !present || avatar != nil {
			t.Fatalf("avatarUrl = %v (present=%v), want null", avatar, present)
		}
		if status, _, _ := testutil.Fetch(t, srv, token, "/users/me/avatar"); status != http.StatusNotFound {
			t.Errorf("GET avatar: status %d, want 404", status)
		}
	})

	t.Run("an uploaded avatar is served back from avatarUrl", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		avatar := testutil.PNG(t, color.RGBA{R: 255, A: 255})

		res := testutil.Upload(t, srv, token, "/users/me/avatar", avatar)

		url, _ := res.Body["avatarUrl"].(string)
		if res.Status != http.StatusOK || url == "" {
			t.Fatalf("upload: %d %v; want 200 with an avatarUrl", res.Status, res.Body)
		}
		if got := testutil.Do(t, srv, http.MethodGet, "/users/me", token, nil).Body["avatarUrl"]; got != url {
			t.Errorf("GET /users/me avatarUrl = %v, want %q", got, url)
		}
		status, contentType, data := testutil.Fetch(t, srv, token, url)
		if status != http.StatusOK || contentType != "image/png" || !bytes.Equal(data, avatar) {
			t.Errorf("GET avatarUrl: %d %q, %d bytes; want 200 image/png with the uploaded bytes", status, contentType, len(data))
		}
	})

	t.Run("a new avatar replaces the old one under a new URL", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		first := testutil.Upload(t, srv, token, "/users/me/avatar", testutil.PNG(t, color.RGBA{R: 255, A: 255})).Body["avatarUrl"]
		second := testutil.PNG(t, color.RGBA{B: 255, A: 255})

		res := testutil.Upload(t, srv, token, "/users/me/avatar", second)

		if res.Body["avatarUrl"] == first {
			t.Fatalf("avatarUrl unchanged after replacing: %v", first)
		}
		if _, _, data := testutil.Fetch(t, srv, token, res.Body["avatarUrl"].(string)); !bytes.Equal(data, second) {
			t.Errorf("served the old avatar after replacing it")
		}
	})

	t.Run("a removed avatar is gone", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		testutil.Upload(t, srv, token, "/users/me/avatar", testutil.PNG(t, color.RGBA{R: 255, A: 255}))

		res := testutil.Do(t, srv, http.MethodDelete, "/users/me/avatar", token, nil)

		if res.Status != http.StatusOK || res.Body["avatarUrl"] != nil {
			t.Fatalf("remove: %d %v; want 200 with no avatarUrl", res.Status, res.Body)
		}
		if status, _, _ := testutil.Fetch(t, srv, token, "/users/me/avatar"); status != http.StatusNotFound {
			t.Errorf("GET avatar after removing: status %d, want 404", status)
		}
	})

	t.Run("each User sees only their own avatar", func(t *testing.T) {
		_, _, mine := testutil.SignUp(t, srv)
		_, _, theirs := testutil.SignUp(t, srv)
		testutil.Upload(t, srv, mine, "/users/me/avatar", testutil.PNG(t, color.RGBA{R: 255, A: 255}))

		if status, _, _ := testutil.Fetch(t, srv, theirs, "/users/me/avatar"); status != http.StatusNotFound {
			t.Errorf("other User's GET avatar: status %d, want 404", status)
		}
	})

	t.Run("rejects files that are not PNG, JPEG or WebP", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)

		res := testutil.Upload(t, srv, token, "/users/me/avatar", []byte("just some text, not an image"))

		if res.Status != http.StatusUnsupportedMediaType || res.ErrorCode() != "unsupported_media_type" {
			t.Errorf("got %d %q, want 415 unsupported_media_type", res.Status, res.ErrorCode())
		}
	})

	t.Run("requires a token", func(t *testing.T) {
		res := testutil.Upload(t, srv, "", "/users/me/avatar", testutil.PNG(t, color.RGBA{R: 255, A: 255}))

		if res.Status != http.StatusUnauthorized {
			t.Errorf("status %d, want 401", res.Status)
		}
	})
}
