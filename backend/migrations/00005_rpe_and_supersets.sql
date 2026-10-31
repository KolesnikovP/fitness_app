-- +goose Up

-- A Superset is two or more Session exercises of one Session sharing a
-- superset_id, done back to back with rest only after the last. It has no
-- table of its own: the shared id is the Superset.
ALTER TABLE session_exercises ADD COLUMN superset_id uuid;

CREATE INDEX session_exercises_superset_id_idx
    ON session_exercises (session_id, superset_id) WHERE superset_id IS NOT NULL;

-- rpe is optional, from 1 to 10 in half steps. superset_id is the Superset
-- the Set's exercise was in when it was logged, kept if it's ungrouped later.
ALTER TABLE session_sets
    ADD COLUMN rpe numeric(3, 1) CHECK (rpe BETWEEN 1 AND 10 AND rpe * 2 = trunc(rpe * 2)),
    ADD COLUMN superset_id uuid;

-- +goose Down
ALTER TABLE session_sets DROP COLUMN superset_id, DROP COLUMN rpe;
DROP INDEX session_exercises_superset_id_idx;
ALTER TABLE session_exercises DROP COLUMN superset_id;
