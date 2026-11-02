-- name: EnsureDefaultProgram :exec
-- Makes the caller's default program, unless they have one.
INSERT INTO programs (account_id, name, is_default)
VALUES ($1, 'My routines', true)
ON CONFLICT (account_id) WHERE is_default DO NOTHING;

-- name: EnsureFirstWeek :one
-- Makes week 1 of the caller's default program, unless it exists, and
-- returns its id.
WITH program AS (
    SELECT id FROM programs WHERE account_id = $1 AND is_default
), added AS (
    INSERT INTO program_weeks (program_id, position)
    SELECT id, 1 FROM program
    ON CONFLICT (program_id, position) DO NOTHING
    RETURNING id
)
SELECT id FROM added
UNION ALL
SELECT w.id FROM program_weeks w JOIN program p ON p.id = w.program_id WHERE w.position = 1
LIMIT 1;

-- name: CreateRoutine :one
INSERT INTO routines (week_id, name)
VALUES ($1, $2)
RETURNING id;

-- name: AddSlot :exec
INSERT INTO exercise_slots (routine_id, position, exercise_id, target_sets, target_reps, target_weight,
                            target_weight_unit, rest_seconds, note, superset_group, substitute_ids)
VALUES (sqlc.arg(routine_id), sqlc.arg(position), sqlc.arg(exercise_id), sqlc.arg(target_sets),
        sqlc.arg(target_reps), sqlc.arg(target_weight)::float8, sqlc.arg(target_weight_unit),
        sqlc.narg(rest_seconds), sqlc.arg(note), sqlc.narg(superset_group), sqlc.arg(substitute_ids)::uuid[]);

-- name: GetRoutine :one
SELECT r.id, r.name, r.updated_at
FROM routines r
JOIN program_weeks w ON w.id = r.week_id
JOIN programs p ON p.id = w.program_id
WHERE r.id = $1 AND p.account_id = $2;

-- name: ListRoutines :many
SELECT r.id, r.name, r.updated_at
FROM routines r
JOIN program_weeks w ON w.id = r.week_id
JOIN programs p ON p.id = w.program_id
WHERE p.account_id = $1
ORDER BY lower(r.name), r.id;

-- name: ListSlotsOfRoutines :many
SELECT id, routine_id, exercise_id, target_sets, target_reps, target_weight::float8 AS target_weight,
       target_weight_unit, rest_seconds, note, superset_group, substitute_ids
FROM exercise_slots
WHERE routine_id = ANY(sqlc.arg(routine_ids)::uuid[])
ORDER BY routine_id, position;

-- name: LockRoutine :one
-- Locks the caller's routine so two edits of it don't interleave.
SELECT r.id
FROM routines r
JOIN program_weeks w ON w.id = r.week_id
JOIN programs p ON p.id = w.program_id
WHERE r.id = $1 AND p.account_id = $2
FOR UPDATE OF r;

-- name: RenameRoutine :exec
UPDATE routines
SET name = $2, updated_at = now()
WHERE id = $1;

-- name: DeleteSlots :exec
DELETE FROM exercise_slots
WHERE routine_id = $1;

-- name: DeleteRoutine :execrows
DELETE FROM routines r
USING program_weeks w, programs p
WHERE r.id = $1 AND w.id = r.week_id AND p.id = w.program_id AND p.account_id = $2;

-- name: ListRoutineNames :many
-- The names of those of ids that are the caller's routines; others are left
-- out.
SELECT r.id, r.name
FROM routines r
JOIN program_weeks w ON w.id = r.week_id
JOIN programs p ON p.id = w.program_id
WHERE r.id = ANY(sqlc.arg(ids)::uuid[]) AND p.account_id = sqlc.arg(caller_id);
