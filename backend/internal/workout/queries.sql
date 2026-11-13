-- name: TransactionTime :one
-- The time the transaction started: a session started in it starts then.
SELECT now()::timestamptz AS now;

-- name: StartSession :one
-- Starts a session called given_name, from a routine unless routine_id is
-- null. It starts at the transaction's time, now().
INSERT INTO workout_sessions (account_id, routine_id, given_name)
VALUES (sqlc.arg(account_id), sqlc.narg(routine_id), sqlc.arg(given_name))
RETURNING id;

-- name: GetSession :one
SELECT id, routine_id, coalesce(name, given_name)::text AS name, started_at, finished_at
FROM workout_sessions
WHERE id = $1 AND account_id = $2;

-- name: RenameSession :execrows
-- Renames the caller's session; a null name clears it, so the session is
-- called the name it was given.
UPDATE workout_sessions
SET name = sqlc.narg(name)
WHERE id = sqlc.arg(id) AND account_id = sqlc.arg(account_id);

-- name: ListSessionExercises :many
SELECT id, exercise_id, note, superset_id, target_sets, target_reps, target_weight, target_weight_unit,
       target_rest_seconds, target_note, planned_exercise_id, substitute_ids
FROM session_exercises
WHERE session_id = $1
ORDER BY created_at, id;

-- name: ListSessionSets :many
SELECT s.id, s.session_exercise_id, s.exercise_id, s.weight::float8 AS weight, s.weight_unit, s.reps, s.note,
       s.rpe, s.superset_id, s.set_type
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
INSERT INTO session_sets (session_exercise_id, exercise_id, weight, weight_unit, reps, note, rpe, superset_id,
                          set_type)
SELECT e.id, e.exercise_id, sqlc.arg(weight)::float8, sqlc.arg(weight_unit), sqlc.arg(reps), sqlc.arg(note),
       sqlc.narg(rpe), e.superset_id, sqlc.arg(set_type)
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
SELECT id, routine_id, coalesce(name, given_name)::text AS name, started_at, finished_at
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
    rpe = sqlc.narg(rpe), note = sqlc.arg(note), set_type = sqlc.arg(set_type)
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
-- The working sets logged in each of the sessions, for working out their
-- stats: warm-ups count toward none.
SELECT e.session_id, s.exercise_id, s.weight::float8 AS weight, s.weight_unit, s.reps
FROM session_sets s
JOIN session_exercises e ON e.id = s.session_exercise_id
WHERE e.session_id = ANY(sqlc.arg(session_ids)::uuid[]) AND s.set_type <> 'warmup'
ORDER BY s.created_at, s.id;

-- name: ListFinishedSetsOfExercises :many
-- Every working set the account logged of the exercises in its finished
-- sessions, in the order they were done: by session finished, then as logged.
-- Personal records, Record tiers and Bests are worked out from these; warm-ups
-- count toward none.
SELECT w.id AS session_id, w.finished_at::timestamptz AS finished_at, s.id, s.exercise_id, s.weight::float8 AS weight,
       s.weight_unit, s.reps
FROM session_sets s
JOIN session_exercises e ON e.id = s.session_exercise_id
JOIN workout_sessions w ON w.id = e.session_id
WHERE w.account_id = sqlc.arg(account_id) AND w.finished_at IS NOT NULL
  AND s.exercise_id = ANY(sqlc.arg(exercise_ids)::uuid[]) AND s.set_type <> 'warmup'
ORDER BY w.finished_at, w.id, s.created_at, s.id;

-- name: ListFinishedTimes :many
-- When each of the account's finished sessions finished.
SELECT finished_at::timestamptz AS finished_at
FROM workout_sessions
WHERE account_id = $1 AND finished_at IS NOT NULL;

-- name: ListFinishedExerciseIDs :many
-- Every exercise the account has logged a set of in a finished session.
SELECT DISTINCT s.exercise_id
FROM session_sets s
JOIN session_exercises e ON e.id = s.session_exercise_id
JOIN workout_sessions w ON w.id = e.session_id
WHERE w.account_id = $1 AND w.finished_at IS NOT NULL;

-- name: ListLastTimeSets :many
-- Last time for each of the exercises: every set of it, warm-ups too, in the
-- account's most recent finished session with a set of it, as logged. A set
-- counts for the exercise it records, so a swapped one for the exercise
-- swapped to.
WITH last AS (
    SELECT DISTINCT ON (s.exercise_id) s.exercise_id, w.id AS session_id
    FROM session_sets s
    JOIN session_exercises e ON e.id = s.session_exercise_id
    JOIN workout_sessions w ON w.id = e.session_id
    WHERE w.account_id = sqlc.arg(account_id) AND w.finished_at IS NOT NULL
      AND s.exercise_id = ANY(sqlc.arg(exercise_ids)::uuid[])
    ORDER BY s.exercise_id, w.finished_at DESC, w.id DESC
)
SELECT s.exercise_id, s.weight::float8 AS weight, s.weight_unit, s.reps, s.rpe, s.set_type
FROM session_sets s
JOIN session_exercises e ON e.id = s.session_exercise_id
JOIN last ON last.exercise_id = s.exercise_id AND last.session_id = e.session_id
ORDER BY s.created_at, s.id;
