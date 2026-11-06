-- name: GetPost :one
-- A Post's caption and when its Progress photo was last set, if it has one.
-- No row means the Post has neither yet.
SELECT p.caption, ph.updated_at AS photo_updated_at
FROM posts p
LEFT JOIN post_photos ph ON ph.session_id = p.session_id
WHERE p.session_id = $1;

-- name: UpsertCaption :exec
INSERT INTO posts (session_id, account_id, caption)
VALUES ($1, $2, $3)
ON CONFLICT (session_id) DO UPDATE SET caption = EXCLUDED.caption;

-- name: EnsurePost :exec
INSERT INTO posts (session_id, account_id)
VALUES ($1, $2)
ON CONFLICT (session_id) DO NOTHING;

-- name: UpsertPhoto :exec
INSERT INTO post_photos (session_id, content_type, data)
VALUES ($1, $2, $3)
ON CONFLICT (session_id)
DO UPDATE SET content_type = EXCLUDED.content_type, data = EXCLUDED.data, updated_at = now();

-- name: DeletePhoto :exec
DELETE FROM post_photos WHERE session_id = $1;

-- name: GetPhoto :one
SELECT content_type, data FROM post_photos WHERE session_id = $1;
