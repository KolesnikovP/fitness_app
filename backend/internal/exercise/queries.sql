-- name: ListExercises :many
-- Canonical exercises plus the caller's own custom ones. Each filter is
-- skipped when null. Sorting by lower(name) under the C collation keeps the
-- order stable across database locales.
SELECT e.id, e.name, e.muscle_group, e.equipment_type, e.is_custom,
       img.updated_at AS image_updated_at,
       anim.updated_at AS animated_demo_updated_at
FROM exercises e
LEFT JOIN exercise_media img ON img.exercise_id = e.id AND img.kind = 'image'
LEFT JOIN exercise_media anim ON anim.exercise_id = e.id AND anim.kind = 'animated_demo'
WHERE (e.owner_id IS NULL OR e.owner_id = sqlc.arg(caller_id)::uuid)
  AND (sqlc.narg(name_pattern)::text IS NULL OR e.name ILIKE sqlc.narg(name_pattern))
  AND (sqlc.narg(muscle_group)::text IS NULL OR e.muscle_group = sqlc.narg(muscle_group))
  AND (sqlc.narg(equipment_type)::text IS NULL OR e.equipment_type = sqlc.narg(equipment_type))
ORDER BY lower(e.name) COLLATE "C", e.id;

-- name: CreateCustomExercise :one
INSERT INTO exercises (name, muscle_group, equipment_type, is_custom, owner_id)
VALUES ($1, $2, $3, true, sqlc.arg(owner_id)::uuid)
RETURNING id, name, muscle_group, equipment_type, is_custom;

-- name: GetVisibleExercise :one
-- An exercise the caller may see: canonical, or one of their own.
SELECT e.id, e.name, e.muscle_group, e.equipment_type, e.is_custom,
       img.updated_at AS image_updated_at,
       anim.updated_at AS animated_demo_updated_at
FROM exercises e
LEFT JOIN exercise_media img ON img.exercise_id = e.id AND img.kind = 'image'
LEFT JOIN exercise_media anim ON anim.exercise_id = e.id AND anim.kind = 'animated_demo'
WHERE e.id = sqlc.arg(id)::uuid
  AND (e.owner_id IS NULL OR e.owner_id = sqlc.arg(caller_id)::uuid);

-- name: UpsertMedia :exec
INSERT INTO exercise_media (exercise_id, kind, content_type, data)
VALUES ($1, $2, $3, $4)
ON CONFLICT (exercise_id, kind)
DO UPDATE SET content_type = EXCLUDED.content_type, data = EXCLUDED.data, updated_at = now();

-- name: GetMedia :one
SELECT content_type, data
FROM exercise_media
WHERE exercise_id = $1 AND kind = $2;
