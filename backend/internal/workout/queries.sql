-- name: StartSession :one
INSERT INTO workout_sessions (account_id)
VALUES ($1)
RETURNING id;

-- name: GetSession :one
SELECT id, started_at, finished_at
FROM workout_sessions
WHERE id = $1 AND account_id = $2;

-- name: ListSessionExercises :many
SELECT id, exercise_id, note
FROM session_exercises
WHERE session_id = $1
ORDER BY created_at, id;

-- name: ListSessionSets :many
SELECT s.id, s.session_exercise_id, s.weight::float8 AS weight, s.weight_unit, s.reps, s.note
FROM session_sets s
JOIN session_exercises e ON e.id = s.session_exercise_id
WHERE e.session_id = $1
ORDER BY s.created_at, s.id;

-- name: GetSessionInProgress :one
SELECT id
FROM workout_sessions
WHERE account_id = $1 AND finished_at IS NULL;

-- name: LockSession :one
-- Locks the caller's session so a write can't race finishing it.
SELECT finished_at
FROM workout_sessions
WHERE id = $1 AND account_id = $2
FOR UPDATE;

-- name: AddSessionExercise :exec
INSERT INTO session_exercises (session_id, exercise_id)
VALUES ($1, $2);

-- name: LogSet :execrows
-- Logs a set, provided the session exercise belongs to the session.
INSERT INTO session_sets (session_exercise_id, weight, weight_unit, reps, note)
SELECT e.id, sqlc.arg(weight)::float8, sqlc.arg(weight_unit), sqlc.arg(reps), sqlc.arg(note)
FROM session_exercises e
WHERE e.id = sqlc.arg(session_exercise_id) AND e.session_id = sqlc.arg(session_id);

-- name: CountSessionSets :one
SELECT count(*)
FROM session_sets s
JOIN session_exercises e ON e.id = s.session_exercise_id
WHERE e.session_id = $1;

-- name: FinishSession :exec
UPDATE workout_sessions
SET finished_at = now()
WHERE id = $1;

-- name: SetSessionExerciseNote :execrows
UPDATE session_exercises
SET note = $3
WHERE id = $1 AND session_id = $2;

-- name: DeleteSession :exec
DELETE FROM workout_sessions
WHERE id = $1;

-- name: ListFinishedSessions :many
SELECT id, started_at, finished_at
FROM workout_sessions
WHERE account_id = $1 AND finished_at IS NOT NULL
ORDER BY finished_at DESC, id;

-- name: ListExercisesOfSessions :many
SELECT session_id, exercise_id
FROM session_exercises
WHERE session_id = ANY(sqlc.arg(session_ids)::uuid[])
ORDER BY created_at, id;
