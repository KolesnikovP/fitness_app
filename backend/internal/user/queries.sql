-- name: CreateProfile :exec
INSERT INTO profiles (account_id) VALUES ($1);

-- name: GetProfile :one
-- The profile, with when its avatar was last set (null without one).
SELECT p.account_id, p.unit_preference, p.name, a.updated_at AS avatar_updated_at
FROM profiles p
LEFT JOIN profile_avatars a ON a.account_id = p.account_id
WHERE p.account_id = $1;

-- name: SetUnitPreference :execrows
UPDATE profiles
SET unit_preference = $2, updated_at = now()
WHERE account_id = $1;

-- name: SetName :execrows
-- A null name clears it.
UPDATE profiles
SET name = $2, updated_at = now()
WHERE account_id = $1;

-- name: UpsertAvatar :exec
INSERT INTO profile_avatars (account_id, content_type, data)
VALUES ($1, $2, $3)
ON CONFLICT (account_id) DO UPDATE
SET content_type = excluded.content_type, data = excluded.data, updated_at = now();

-- name: DeleteAvatar :exec
DELETE FROM profile_avatars WHERE account_id = $1;

-- name: GetAvatar :one
SELECT content_type, data FROM profile_avatars WHERE account_id = $1;
