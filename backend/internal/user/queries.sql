-- name: CreateProfile :exec
INSERT INTO profiles (account_id) VALUES ($1);

-- name: GetProfile :one
SELECT account_id, unit_preference
FROM profiles
WHERE account_id = $1;

-- name: SetUnitPreference :one
UPDATE profiles
SET unit_preference = $2, updated_at = now()
WHERE account_id = $1
RETURNING account_id, unit_preference;
