package exercise_test

import (
	"bytes"
	"encoding/json"
	"image"
	"image/color"
	"image/gif"
	"image/png"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/KolesnikovP/fitness_app/backend/internal/testutil"
)

func pngBytes(t *testing.T) []byte {
	t.Helper()
	var buf bytes.Buffer
	img := image.NewRGBA(image.Rect(0, 0, 2, 2))
	img.Set(0, 0, color.RGBA{R: 255, A: 255})
	if err := png.Encode(&buf, img); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func gifBytes(t *testing.T) []byte {
	t.Helper()
	var buf bytes.Buffer
	frame := image.NewPaletted(image.Rect(0, 0, 2, 2), []color.Color{color.Black, color.White})
	if err := gif.EncodeAll(&buf, &gif.GIF{Image: []*image.Paletted{frame, frame}, Delay: []int{10, 10}}); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

// upload sends data as the "file" field of a multipart form.
func upload(t *testing.T, srv *httptest.Server, token, exerciseID string, data []byte) testutil.Response {
	t.Helper()
	var body bytes.Buffer
	form := multipart.NewWriter(&body)
	part, err := form.CreateFormFile("file", "upload")
	if err != nil {
		t.Fatal(err)
	}
	part.Write(data)
	form.Close()

	req, err := http.NewRequest(http.MethodPost, srv.URL+"/exercises/"+exerciseID+"/media", &body)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", form.FormDataContentType())
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := srv.Client().Do(req)
	if err != nil {
		t.Fatalf("upload: %v", err)
	}
	defer res.Body.Close()

	out := testutil.Response{Status: res.StatusCode}
	if err := json.NewDecoder(res.Body).Decode(&out.Body); err != nil {
		t.Fatalf("upload: response is not JSON: %v", err)
	}
	return out
}

// fetch GETs a media path and returns the status, content type and bytes.
func fetch(t *testing.T, srv *httptest.Server, token, path string) (int, string, []byte) {
	t.Helper()
	req, err := http.NewRequest(http.MethodGet, srv.URL+path, nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	res, err := srv.Client().Do(req)
	if err != nil {
		t.Fatalf("GET %s: %v", path, err)
	}
	defer res.Body.Close()
	data, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatal(err)
	}
	return res.StatusCode, res.Header.Get("Content-Type"), data
}

func TestExerciseMedia(t *testing.T) {
	srv := testutil.NewServer(t)

	t.Run("an uploaded image is served back from imageUrl", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		created := createExercise(t, srv, token, "Cable Y-Raise", "shoulders", "cable")
		img := pngBytes(t)

		res := upload(t, srv, token, created["id"].(string), img)

		if res.Status != http.StatusOK {
			t.Fatalf("upload: status %d, body %v", res.Status, res.Body)
		}
		url, _ := res.Body["imageUrl"].(string)
		if url == "" || res.Body["animationUrl"] != nil {
			t.Fatalf("after upload: %v, want imageUrl only", res.Body)
		}
		status, contentType, data := fetch(t, srv, token, url)
		if status != http.StatusOK || contentType != "image/png" || !bytes.Equal(data, img) {
			t.Fatalf("GET imageUrl: %d %q, %d bytes; want 200 image/png with the uploaded bytes", status, contentType, len(data))
		}
	})

	t.Run("a GIF becomes the animated demo and leaves the image alone", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := createExercise(t, srv, token, "Turkish Get-up", "full_body", "kettlebell")["id"].(string)
		withImage := upload(t, srv, token, id, pngBytes(t))
		anim := gifBytes(t)

		res := upload(t, srv, token, id, anim)

		url, _ := res.Body["animationUrl"].(string)
		if res.Status != http.StatusOK || url == "" || res.Body["imageUrl"] != withImage.Body["imageUrl"] {
			t.Fatalf("after GIF upload: %d %v", res.Status, res.Body)
		}
		status, contentType, data := fetch(t, srv, token, url)
		if status != http.StatusOK || contentType != "image/gif" || !bytes.Equal(data, anim) {
			t.Fatalf("GET animationUrl: %d %q, %d bytes", status, contentType, len(data))
		}

		detail := testutil.Do(t, srv, http.MethodGet, "/exercises/"+id, token, nil)
		if detail.Body["animationUrl"] != url {
			t.Errorf("detail animationUrl = %v, want %q", detail.Body["animationUrl"], url)
		}
	})

	t.Run("rejects files that are not PNG, JPEG, WebP or GIF", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := createExercise(t, srv, token, "Text Lift", "abs", "other")["id"].(string)

		res := upload(t, srv, token, id, []byte("just some text, not an image"))

		if res.Status != http.StatusUnsupportedMediaType || res.ErrorCode() != "unsupported_media_type" {
			t.Fatalf("got %d %q, want 415 unsupported_media_type", res.Status, res.ErrorCode())
		}
	})

	t.Run("rejects files over 10 MB", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := createExercise(t, srv, token, "Huge Lift", "abs", "other")["id"].(string)
		big := append(pngBytes(t), make([]byte, 10<<20)...)

		res := upload(t, srv, token, id, big)

		if res.Status != http.StatusRequestEntityTooLarge || res.ErrorCode() != "media_too_large" {
			t.Fatalf("got %d %q, want 413 media_too_large", res.Status, res.ErrorCode())
		}
	})

	t.Run("canonical exercises can't be changed", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		plank := find(exercises(t, testutil.Do(t, srv, http.MethodGet, "/exercises?q=plank", token, nil)), "Plank")

		res := upload(t, srv, token, plank["id"].(string), pngBytes(t))

		if res.Status != http.StatusForbidden || res.ErrorCode() != "exercise_not_editable" {
			t.Fatalf("got %d %q, want 403 exercise_not_editable", res.Status, res.ErrorCode())
		}
	})

	t.Run("another user's custom exercise stays hidden", func(t *testing.T) {
		_, _, mine := testutil.SignUp(t, srv)
		_, _, theirs := testutil.SignUp(t, srv)
		id := createExercise(t, srv, mine, "My Move", "abs", "other")["id"].(string)
		url := upload(t, srv, mine, id, pngBytes(t)).Body["imageUrl"].(string)

		if res := upload(t, srv, theirs, id, pngBytes(t)); res.Status != http.StatusNotFound {
			t.Errorf("their upload: status %d, want 404", res.Status)
		}
		if status, _, _ := fetch(t, srv, theirs, url); status != http.StatusNotFound {
			t.Errorf("their GET imageUrl: status %d, want 404", status)
		}
	})

	t.Run("404s for media that was never uploaded", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		id := createExercise(t, srv, token, "Bare Move", "abs", "other")["id"].(string)

		if status, _, _ := fetch(t, srv, token, "/exercises/"+id+"/image"); status != http.StatusNotFound {
			t.Fatalf("status %d, want 404", status)
		}
	})
}
