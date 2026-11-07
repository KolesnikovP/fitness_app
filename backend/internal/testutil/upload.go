package testutil

import (
	"bytes"
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"
)

// PNG returns a tiny PNG with one pixel of fill, so two fills make two
// different files.
func PNG(t *testing.T, fill color.Color) []byte {
	t.Helper()
	var buf bytes.Buffer
	img := image.NewRGBA(image.Rect(0, 0, 2, 2))
	img.Set(0, 0, fill)
	if err := png.Encode(&buf, img); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

// Upload PUTs data to path as the "file" field of a multipart form.
func Upload(t *testing.T, srv *httptest.Server, path, token string, data []byte) Response {
	t.Helper()
	var body bytes.Buffer
	form := multipart.NewWriter(&body)
	part, err := form.CreateFormFile("file", "upload")
	if err != nil {
		t.Fatal(err)
	}
	part.Write(data)
	form.Close()

	req, err := http.NewRequest(http.MethodPut, srv.URL+path, &body)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", form.FormDataContentType())
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := srv.Client().Do(req)
	if err != nil {
		t.Fatalf("PUT %s: %v", path, err)
	}
	defer res.Body.Close()

	out := Response{Status: res.StatusCode}
	if err := json.NewDecoder(res.Body).Decode(&out.Body); err != nil {
		t.Fatalf("PUT %s: response is not JSON: %v", path, err)
	}
	return out
}

// Fetch GETs path and returns the status, content type and bytes.
func Fetch(t *testing.T, srv *httptest.Server, token, path string) (status int, contentType string, data []byte) {
	t.Helper()
	req, err := http.NewRequest(http.MethodGet, srv.URL+path, nil)
	if err != nil {
		t.Fatal(err)
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := srv.Client().Do(req)
	if err != nil {
		t.Fatalf("GET %s: %v", path, err)
	}
	defer res.Body.Close()
	data, err = io.ReadAll(res.Body)
	if err != nil {
		t.Fatal(err)
	}
	return res.StatusCode, res.Header.Get("Content-Type"), data
}
