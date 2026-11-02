-- name: StartSession :one
-- Starts a session, from a routine unless routine_id is null.
INSERT INTO workout_sessions (account_id, routine_id)
VALUES (sqlc.arg(account_id), sqlc.narg(routine_id))
RETURNING id;

-- name: GetSession :one
SELECT id, routine_id, started_at, finished_at
FROM workout_sessions
WHERE id = $1 AND account_id = $2;

-- name: ListSessionExercises :many
SELECT id, exercise_id, note, superset_id, target_sets, target_reps, target_weight, target_weight_unit,
       target_rest_seconds, target_note, planned_exercise_id, substitute_ids
FROM session_exercises
WHERE session_id = $1
ORDER BY created_at, id;

-- name: ListSessionSets :many
SELECT s.id, s.session_exercise_id, s.exercise_id, s.weight::float8 AS weight, s.weight_unit, s.reps, s.note,
       s.rpe, s.superset_id
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

-- name: AddPlannedSessionExercise :exec
-- Adds an exercise from a routine's slot, with a copy of its target and
-- substitutes.
INSERT INTO session_exercises (session_id, exercise_id, planned_exercise_id, substitute_ids, superset_id,
                               target_sets, target_reps, target_weight, target_weight_unit, target_rest_seconds,
                               target_note)
VALUES (sqlc.arg(session_id), sqlc.arg(exercise_id), sqlc.arg(exercise_id), sqlc.arg(substitute_ids)::uuid[],
        sqlc.narg(superset_id), sqlc.arg(target_sets), sqlc.arg(target_reps), sqlc.arg(target_weight)::float8,
        sqlc.arg(target_weight_unit), sqlc.narg(target_rest_seconds), sqlc.arg(target_note));

-- name: LogSet :execrows
-- Logs a set, provided the session exercise belongs to the session. The set
-- records the exercise being done now (a substitute, if swapped to one) and
-- keeps the superset its session exercise is in now.
INSERT INTO session_sets (session_exercise_id, exercise_id, weight, weight_unit, reps, note, rpe, superset_id)
SELECT e.id, e.exercise_id, sqlc.arg(weight)::float8, sqlc.arg(weight_unit), sqlc.arg(reps), sqlc.arg(note),
       sqlc.narg(rpe), e.superset_id
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
-- The exercises done in each session: for each session exercise in order,
-- the exercise of each of its sets in order, or its own if it has none.
SELECT e.session_id, coalesce(s.exercise_id, e.exercise_id)::uuid AS exercise_id
FROM session_exercises e
LEFT JOIN session_sets s ON s.session_exercise_id = e.id
WHERE e.session_id = ANY(sqlc.arg(session_ids)::uuid[])
ORDER BY e.created_at, e.id, s.created_at, s.id;

-- name: GetSwapOptions :one
-- What a session exercise of the session can be swapped to: its planned
-- exercise (null if it wasn't planned) and substitutes.
SELECT planned_exercise_id, substitute_ids
FROM session_exercises
WHERE id = $1 AND session_id = $2;

-- name: SwapExercise :exec
UPDATE session_exercises
SET exercise_id = $3
WHERE id = $1 AND session_id = $2;

-- name: ListSupersetsOf :many
-- The superset of each of the given session exercises that is in the session.
SELECT id, superset_id
FROM session_exercises
WHERE session_id = sqlc.arg(session_id) AND id = ANY(sqlc.arg(ids)::uuid[]);

-- name: AssignSuperset :exec
UPDATE session_exercises
SET superset_id = sqlc.arg(superset_id)
WHERE session_id = sqlc.arg(session_id) AND id = ANY(sqlc.arg(ids)::uuid[]);

-- name: UngroupSuperset :execrows
UPDATE session_exercises
SET superset_id = NULL
WHERE session_id = $1 AND superset_id = $2;

-- name: UpdateSet :execrows
-- Corrects a set, provided it belongs to the session. It keeps its order and
-- the superset it was logged in.
UPDATE session_sets s
SET weight = sqlc.arg(weight)::float8, weight_unit = sqlc.arg(weight_unit), reps = sqlc.arg(reps),
    rpe = sqlc.narg(rpe), note = sqlc.arg(note)
FROM session_exercises e
WHERE s.id = sqlc.arg(id) AND e.id = s.session_exercise_id AND e.session_id = sqlc.arg(session_id);

-- name: DeleteSet :execrows
-- Deletes a set, provided it belongs to the session.
DELETE FROM session_sets s
USING session_exercises e
WHERE s.id = sqlc.arg(id) AND e.id = s.session_exercise_id AND e.session_id = sqlc.arg(session_id);

-- name: ListFinishedSessionsBetween :many
-- The caller's sessions finished at or after from and before to.
SELECT id, started_at, finished_at
FROM workout_sessions
WHERE account_id = sqlc.arg(account_id) AND finished_at >= sqlc.arg(from_time)::timestamptz
  AND finished_at < sqlc.arg(to_time)::timestamptz
ORDER BY finished_at DESC, id;

-- name: ListSetsOfSessions :many
-- The sets logged in each of the sessions, for working out their stats.
SELECT e.session_id, s.exercise_id, s.weight::float8 AS weight, s.weight_unit, s.reps
FROM session_sets s
JOIN session_exercises e ON e.id = s.session_exercise_id
WHERE e.session_id = ANY(sqlc.arg(session_ids)::uuid[])
ORDER BY s.created_at, s.id;
