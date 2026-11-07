package feed

import (
	"errors"
	"fmt"
	"net/http"

	"github.com/jackc/pgx/v5"

	"github.com/KolesnikovP/fitness_app/backend/internal/auth"
	"github.com/KolesnikovP/fitness_app/backend/internal/feed/store"
	"github.com/KolesnikovP/fitness_app/backend/internal/platform/httpx"
)

// photoTypes are the content types a Progress photo may be, as sniffed from
// its bytes.
var photoTypes = map[string]bool{"image/png": true, "image/jpeg": true, "image/webp": true}

// setPhoto sets the Progress photo of one of the caller's Posts, replacing
// any earlier one. The file is the "file" field of a multipart form.
func (h handlers) setPhoto(w http.ResponseWriter, r *http.Request) {
	session, ok := h.loadSession(w, r)
	if !ok {
		return
	}
	data, ok := httpx.ReadUploadedFile(w, r)
	if !ok {
		return
	}
	contentType := http.DetectContentType(data)
	if !photoTypes[contentType] {
		httpx.WriteError(w, http.StatusUnsupportedMediaType, "unsupported_media_type", "Upload a PNG, JPEG or WebP image.")
		return
	}

	ctx := r.Context()
	caller, _ := auth.AccountID(ctx)
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		httpx.WriteInternalError(w, r, fmt.Errorf("begin: %w", err))
		return
	}
	defer tx.Rollback(ctx)
	q := h.queries.WithTx(tx)
	if err := q.EnsurePost(ctx, store.EnsurePostParams{SessionID: session.ID, AccountID: caller}); err != nil {
		httpx.WriteInternalError(w, r, fmt.Errorf("create post: %w", err))
		return
	}
	if err := q.UpsertPhoto(ctx, store.UpsertPhotoParams{SessionID: session.ID, ContentType: contentType, Data: data}); err != nil {
		httpx.WriteInternalError(w, r, fmt.Errorf("save photo: %w", err))
		return
	}
	if err := tx.Commit(ctx); err != nil {
		httpx.WriteInternalError(w, r, fmt.Errorf("commit: %w", err))
		return
	}
	h.writePost(w, r, session)
}

// removePhoto removes the Progress photo of one of the caller's Posts, if it
// has one.
func (h handlers) removePhoto(w http.ResponseWriter, r *http.Request) {
	session, ok := h.loadSession(w, r)
	if !ok {
		return
	}
	if err := h.queries.DeletePhoto(r.Context(), session.ID); err != nil {
		httpx.WriteInternalError(w, r, fmt.Errorf("delete photo: %w", err))
		return
	}
	h.writePost(w, r, session)
}

// servePhoto returns the Progress photo of one of the caller's Posts. Photo
// URLs change whenever the photo does, so clients may cache a response
// forever.
func (h handlers) servePhoto(w http.ResponseWriter, r *http.Request) {
	session, ok := h.loadSession(w, r)
	if !ok {
		return
	}
	photo, err := h.queries.GetPhoto(r.Context(), session.ID)
	if errors.Is(err, pgx.ErrNoRows) {
		httpx.WriteError(w, http.StatusNotFound, "photo_not_found", "This post has no photo.")
		return
	}
	if err != nil {
		httpx.WriteInternalError(w, r, fmt.Errorf("load photo: %w", err))
		return
	}
	w.Header().Set("Content-Type", photo.ContentType)
	w.Header().Set("Cache-Control", "private, max-age=31536000, immutable")
	w.Write(photo.Data)
}
