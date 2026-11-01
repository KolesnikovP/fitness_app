-- +goose Up

-- An Exercise slot's Substitutes: the Exercises, in order, the User can swap
-- its own for when they need to. The program module checks each is one the
-- User may see.
ALTER TABLE exercise_slots
    ADD COLUMN substitute_ids uuid[] NOT NULL DEFAULT '{}' CHECK (cardinality(substitute_ids) <= 10);

-- A Session exercise started from a slot keeps a copy of what it planned:
-- planned_exercise_id is the slot's Exercise, and substitute_ids its
-- Substitutes. exercise_id is the one being done now, which a swap changes to
-- the planned one or a Substitute. planned_exercise_id is null for an exercise
-- added during the Session, which can't be swapped.
ALTER TABLE session_exercises
    ADD COLUMN planned_exercise_id uuid REFERENCES exercises (id),
    ADD COLUMN substitute_ids uuid[] NOT NULL DEFAULT '{}';

UPDATE session_exercises SET planned_exercise_id = exercise_id WHERE target_sets IS NOT NULL;

-- Each Set records the Exercise actually done, which a swap can make differ
-- from its Session exercise's planned one.
ALTER TABLE session_sets ADD COLUMN exercise_id uuid REFERENCES exercises (id);

UPDATE session_sets s
SET exercise_id = e.exercise_id
FROM session_exercises e
WHERE e.id = s.session_exercise_id;

ALTER TABLE session_sets ALTER COLUMN exercise_id SET NOT NULL;

-- +goose Down
ALTER TABLE session_sets DROP COLUMN exercise_id;
ALTER TABLE session_exercises DROP COLUMN substitute_ids, DROP COLUMN planned_exercise_id;
ALTER TABLE exercise_slots DROP COLUMN substitute_ids;
