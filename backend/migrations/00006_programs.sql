-- +goose Up

-- Programs, their weeks, the Routines in each week and the Exercise slots of
-- each Routine, owned by the program module; then the workout module's tables
-- gain a Session's Routine and each Session exercise's Target.
--
-- v1 shows no Programs or weeks: each User has one default Program, made with
-- their first Routine, holding a single week that every Routine goes in.
CREATE TABLE programs (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    name       text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
    is_default boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX programs_one_default_key ON programs (account_id) WHERE is_default;

CREATE TABLE program_weeks (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id uuid NOT NULL REFERENCES programs (id) ON DELETE CASCADE,
    position   integer NOT NULL CHECK (position >= 1),
    UNIQUE (program_id, position)
);

CREATE TABLE routines (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    week_id    uuid NOT NULL REFERENCES program_weeks (id) ON DELETE CASCADE,
    name       text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX routines_week_id_idx ON routines (week_id);

-- One planned Exercise of a Routine, in position order. Slots sharing a
-- superset_group are a planned Superset. Editing a Routine replaces its slots.
CREATE TABLE exercise_slots (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    routine_id         uuid NOT NULL REFERENCES routines (id) ON DELETE CASCADE,
    position           integer NOT NULL CHECK (position >= 1),
    exercise_id        uuid NOT NULL REFERENCES exercises (id),
    target_sets        integer NOT NULL CHECK (target_sets BETWEEN 1 AND 20),
    target_reps        integer NOT NULL CHECK (target_reps BETWEEN 1 AND 1000),
    target_weight      numeric(7, 2) NOT NULL CHECK (target_weight >= 0),
    target_weight_unit text NOT NULL CHECK (target_weight_unit IN ('kg', 'lb')),
    rest_seconds       integer CHECK (rest_seconds BETWEEN 1 AND 3600),
    note               text NOT NULL DEFAULT '' CHECK (length(note) <= 500),
    superset_group     integer CHECK (superset_group >= 1),
    UNIQUE (routine_id, position)
);

-- A Session started from a Routine remembers it, until the Routine is deleted.
ALTER TABLE workout_sessions
    ADD CONSTRAINT workout_sessions_routine_id_fkey
    FOREIGN KEY (routine_id) REFERENCES routines (id) ON DELETE SET NULL;

-- A Session exercise started from an Exercise slot keeps a copy of the slot's
-- Target, so editing the Routine later doesn't change the Session. All null
-- for an exercise added during the Session.
ALTER TABLE session_exercises
    ADD COLUMN target_sets         integer CHECK (target_sets BETWEEN 1 AND 20),
    ADD COLUMN target_reps         integer CHECK (target_reps BETWEEN 1 AND 1000),
    ADD COLUMN target_weight       numeric(7, 2) CHECK (target_weight >= 0),
    ADD COLUMN target_weight_unit  text CHECK (target_weight_unit IN ('kg', 'lb')),
    ADD COLUMN target_rest_seconds integer CHECK (target_rest_seconds BETWEEN 1 AND 3600),
    ADD COLUMN target_note         text CHECK (length(target_note) <= 500),
    ADD CHECK (num_nulls(target_sets, target_reps, target_weight, target_weight_unit, target_note) IN (0, 5)),
    ADD CHECK (target_rest_seconds IS NULL OR target_sets IS NOT NULL);

-- +goose Down
ALTER TABLE session_exercises
    DROP COLUMN target_note,
    DROP COLUMN target_rest_seconds,
    DROP COLUMN target_weight_unit,
    DROP COLUMN target_weight,
    DROP COLUMN target_reps,
    DROP COLUMN target_sets;
ALTER TABLE workout_sessions DROP CONSTRAINT workout_sessions_routine_id_fkey;
DROP TABLE exercise_slots;
DROP TABLE routines;
DROP TABLE program_weeks;
DROP TABLE programs;
