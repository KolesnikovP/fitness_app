package user

import (
	"errors"
	"fmt"
	"net/http"

	"github.com/jackc/pgx/v5"

	"github.com/KolesnikovP/fitness_app/backend/internal/auth"
	"github.com/KolesnikovP/fitness_app/backend/internal/platform/httpx"
	"github.com/KolesnikovP/fitness_app/backend/internal/user/store"
)

// avatarTypes are the content types an avatar may be, as sniffed from its
// bytes.
var avatarTypes = map[string]bool{"image/png": true, "image/jpeg": true, "image/webp": true}

// setAvatar sets the caller's avatar, replacing any earlier one. The file is
// the "file" field of a multipart form.
func (h handlers) setAvatar(w http.ResponseWriter, r *http.Request) {
	data, ok := httpx.ReadUploadedFile(w, r)
	if !ok {
		return
	}
	contentType := http.DetectContentType(data)
	if !avatarTypes[contentType] {
		httpx.WriteError(w, http.StatusUnsupportedMediaType, "unsupported_media_type", "Upload a PNG, JPEG or WebP image.")
		return
	}
	id, _ := auth.AccountID(r.Context())
	if err := h.queries.UpsertAvatar(r.Context(), store.UpsertAvatarParams{
		AccountID: id, ContentType: contentType, Data: data,
	}); err != nil {
		httpx.WriteInternalError(w, r, fmt.Errorf("save avatar: %w", err))
		return
	}
	h.writeMe(w, r, id)
}

// removeAvatar removes the caller's avatar, if they have one.
func (h handlers) removeAvatar(w http.ResponseWriter, r *http.Request) {
	id, _ := auth.AccountID(r.Context())
	if err := h.queries.DeleteAvatar(r.Context(), id); err != nil {
		httpx.WriteInternalError(w, r, fmt.Errorf("delete avatar: %w", err))
		return
	}
	h.writeMe(w, r, id)
}

// serveAvatar returns the caller's avatar. Avatar URLs change whenever the
// avatar does, so clients may cache a response forever.
func (h handlers) serveAvatar(w http.ResponseWriter, r *http.Request) {
	id, _ := auth.AccountID(r.Context())
	avatar, err := h.queries.GetAvatar(r.Context(), id)
	if errors.Is(err, pgx.ErrNoRows) {
		httpx.WriteError(w, http.StatusNotFound, "avatar_not_found", "You have no avatar.")
		return
	}
	if err != nil {
		httpx.WriteInternalError(w, r, fmt.Errorf("load avatar: %w", err))
		return
	}
	w.Header().Set("Content-Type", avatar.ContentType)
	w.Header().Set("Cache-Control", "private, max-age=31536000, immutable")
	w.Write(avatar.Data)
}
