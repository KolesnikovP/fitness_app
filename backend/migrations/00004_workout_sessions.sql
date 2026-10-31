-- +goose Up

-- Logged workouts. Owned by the workout module.
-- A Session is in progress while finished_at is null; a User has at most one
-- in progress. routine_id is null for a freeform Session. Routines don't
-- exist yet, so it has no foreign key until the program module adds them.
CREATE TABLE workout_sessions (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id  uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    routine_id  uuid,
    started_at  timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz,
    CHECK (finished_at IS NULL OR finished_at >= started_at)
);

CREATE UNIQUE INDEX workout_sessions_one_in_progress_key
    ON workout_sessions (account_id) WHERE finished_at IS NULL;
CREATE INDEX workout_sessions_history_idx
    ON workout_sessions (account_id, finished_at DESC) WHERE finished_at IS NOT NULL;

-- An Exercise added to a Session, in the order it was added.
CREATE TABLE session_exercises (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  uuid NOT NULL REFERENCES workout_sessions (id) ON DELETE CASCADE,
    exercise_id uuid NOT NULL REFERENCES exercises (id),
    note        text NOT NULL DEFAULT '' CHECK (length(note) <= 500),
    created_at  timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX session_exercises_session_id_idx ON session_exercises (session_id, created_at);

-- A Set logged for a Session exercise. The weight keeps the unit it was
-- logged in.
CREATE TABLE session_sets (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_exercise_id uuid NOT NULL REFERENCES session_exercises (id) ON DELETE CASCADE,
    weight              numeric(7, 2) NOT NULL CHECK (weight >= 0),
    weight_unit         text NOT NULL CHECK (weight_unit IN ('kg', 'lb')),
    reps                integer NOT NULL CHECK (reps BETWEEN 1 AND 1000),
    note                text NOT NULL DEFAULT '' CHECK (length(note) <= 500),
    created_at          timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX session_sets_session_exercise_id_idx ON session_sets (session_exercise_id, created_at);

-- +goose Down
DROP TABLE session_sets;
DROP TABLE session_exercises;
DROP TABLE workout_sessions;
