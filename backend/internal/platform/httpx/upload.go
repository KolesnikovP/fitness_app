package httpx

import (
	"errors"
	"io"
	"net/http"
)

const (
	// MaxUploadBytes is the most an uploaded file may be: an Exercise's media
	// or a Post's Progress photo.
	MaxUploadBytes = 10 << 20
	// Room for the multipart boundaries and headers around the file.
	maxUploadBodyBytes = MaxUploadBytes + 64<<10
)

// ReadUploadedFile returns the bytes of the "file" field of r's multipart
// form, at most MaxUploadBytes. On failure it writes the error response and
// returns false.
func ReadUploadedFile(w http.ResponseWriter, r *http.Request) ([]byte, bool) {
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadBodyBytes)
	form, err := r.MultipartReader()
	if err != nil {
		writeMissingFile(w)
		return nil, false
	}
	for {
		part, err := form.NextPart()
		if err != nil {
			if isTooLarge(err) {
				writeTooLarge(w)
			} else {
				writeMissingFile(w)
			}
			return nil, false
		}
		if part.FormName() != "file" {
			continue
		}
		data, err := io.ReadAll(io.LimitReader(part, MaxUploadBytes+1))
		switch {
		case isTooLarge(err) || len(data) > MaxUploadBytes:
			writeTooLarge(w)
			return nil, false
		case err != nil || len(data) == 0:
			writeMissingFile(w)
			return nil, false
		}
		return data, true
	}
}

func isTooLarge(err error) bool {
	var tooLarge *http.MaxBytesError
	return errors.As(err, &tooLarge)
}

func writeMissingFile(w http.ResponseWriter) {
	WriteError(w, http.StatusBadRequest, "missing_file", `Send the file as the "file" field of a multipart form.`)
}

func writeTooLarge(w http.ResponseWriter) {
	WriteError(w, http.StatusRequestEntityTooLarge, "media_too_large", "Files must be 10 MB or smaller.")
}

// imageTypes are the content types an uploaded image may be, as sniffed from
// its bytes.
var imageTypes = map[string]bool{"image/png": true, "image/jpeg": true, "image/webp": true}

// ImageType sniffs data's content type and returns it if it's a PNG, JPEG or
// WebP image. Otherwise it writes the 415 response and returns false.
func ImageType(w http.ResponseWriter, data []byte) (string, bool) {
	contentType := http.DetectContentType(data)
	if !imageTypes[contentType] {
		WriteError(w, http.StatusUnsupportedMediaType, "unsupported_media_type", "Upload a PNG, JPEG or WebP image.")
		return "", false
	}
	return contentType, true
}
