package exercise

import (
	"errors"
	"fmt"
	"net/http"

	"github.com/jackc/pgx/v5"

	"github.com/KolesnikovP/fitness_app/backend/internal/exercise/store"
	"github.com/KolesnikovP/fitness_app/backend/internal/platform/httpx"
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

	data, ok := httpx.ReadUploadedFile(w, r)
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
