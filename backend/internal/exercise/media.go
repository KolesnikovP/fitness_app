package exercise

import (
	"errors"
	"fmt"
	"io"
	"net/http"

	"github.com/jackc/pgx/v5"

	"github.com/KolesnikovP/fitness_app/backend/internal/exercise/store"
	"github.com/KolesnikovP/fitness_app/backend/internal/platform/httpx"
)

const (
	maxMediaBytes = 10 << 20
	// Room for the multipart boundaries and headers around the file.
	maxUploadBodyBytes = maxMediaBytes + 64<<10
)

// mediaKinds maps each accepted content type, as sniffed from the file's
// bytes, to the slot it fills. A GIF is the animated demo; everything else
// is the static image.
var mediaKinds = map[string]string{
	"image/png":  kindImage,
	"image/jpeg": kindImage,
	"image/webp": kindImage,
	"image/gif":  kindAnimatedDemo,
}

// uploadMedia sets the static image or the animated demo of the caller's own
// custom exercise, replacing any earlier one of the same kind. The file is
// the "file" field of a multipart form.
func (h handlers) uploadMedia(w http.ResponseWriter, r *http.Request) {
	row, ok := h.loadVisible(w, r)
	if !ok {
		return
	}
	// A visible custom exercise is always the caller's own.
	if !row.IsCustom {
		httpx.WriteError(w, http.StatusForbidden, "exercise_not_editable", "Only your own custom exercises can be changed.")
		return
	}

	data, ok := readUploadedFile(w, r)
	if !ok {
		return
	}
	contentType := http.DetectContentType(data)
	kind, ok := mediaKinds[contentType]
	if !ok {
		httpx.WriteError(w, http.StatusUnsupportedMediaType, "unsupported_media_type", "Upload a PNG, JPEG, WebP or GIF image.")
		return
	}

	if err := h.queries.UpsertMedia(r.Context(), store.UpsertMediaParams{
		ExerciseID:  row.ID,
		Kind:        kind,
		ContentType: contentType,
		Data:        data,
	}); err != nil {
		httpx.WriteInternalError(w, r, fmt.Errorf("save media: %w", err))
		return
	}

	h.get(w, r)
}

// readUploadedFile returns the bytes of the form's "file" field. On failure
// it writes the error response and returns false.
func readUploadedFile(w http.ResponseWriter, r *http.Request) ([]byte, bool) {
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
		data, err := io.ReadAll(io.LimitReader(part, maxMediaBytes+1))
		switch {
		case isTooLarge(err) || len(data) > maxMediaBytes:
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
	httpx.WriteError(w, http.StatusBadRequest, "missing_file", `Send the file as the "file" field of a multipart form.`)
}

func writeTooLarge(w http.ResponseWriter) {
	httpx.WriteError(w, http.StatusRequestEntityTooLarge, "media_too_large", "Files must be 10 MB or smaller.")
}

// serveMedia returns an exercise's static image or animated demo. The URLs
// the API hands out change whenever the media does, so clients may cache a
// response forever.
func (h handlers) serveMedia(kind string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		row, ok := h.loadVisible(w, r)
		if !ok {
			return
		}
		media, err := h.queries.GetMedia(r.Context(), store.GetMediaParams{ExerciseID: row.ID, Kind: kind})
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.WriteError(w, http.StatusNotFound, "media_not_found", "This exercise has no such media.")
			return
		}
		if err != nil {
			httpx.WriteInternalError(w, r, fmt.Errorf("load media: %w", err))
			return
		}
		w.Header().Set("Content-Type", media.ContentType)
		w.Header().Set("Cache-Control", "private, max-age=31536000, immutable")
		w.Write(media.Data)
	}
}
