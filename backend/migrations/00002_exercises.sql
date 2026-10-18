-- +goose Up

-- The exercise library. Owned by the exercise module.
-- Canonical exercises have no owner; a custom exercise belongs to the user
-- who created it and only that user sees it.
CREATE TABLE exercises (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name         text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
    muscle_group text NOT NULL CHECK (muscle_group IN (
        'chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms',
        'abs', 'quads', 'hamstrings', 'glutes', 'calves', 'full_body')),
    equipment    text NOT NULL CHECK (equipment IN (
        'barbell', 'dumbbell', 'machine', 'cable', 'bodyweight',
        'kettlebell', 'band', 'other')),
    is_custom    boolean NOT NULL,
    owner_id     uuid REFERENCES accounts (id) ON DELETE CASCADE,
    created_at   timestamptz NOT NULL DEFAULT now(),
    CHECK (is_custom = (owner_id IS NOT NULL))
);

CREATE INDEX exercises_owner_id_idx ON exercises (owner_id);
CREATE UNIQUE INDEX exercises_canonical_name_key ON exercises (lower(name)) WHERE owner_id IS NULL;

-- An exercise's optional static image and animated (GIF) demo, one of each.
CREATE TABLE exercise_media (
    exercise_id  uuid NOT NULL REFERENCES exercises (id) ON DELETE CASCADE,
    kind         text NOT NULL CHECK (kind IN ('image', 'animation')),
    content_type text NOT NULL,
    data         bytea NOT NULL,
    updated_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (exercise_id, kind)
);

INSERT INTO exercises (name, muscle_group, equipment, is_custom) VALUES
    ('Bench Press',               'chest',      'barbell',    false),
    ('Incline Bench Press',       'chest',      'barbell',    false),
    ('Dumbbell Bench Press',      'chest',      'dumbbell',   false),
    ('Incline Dumbbell Press',    'chest',      'dumbbell',   false),
    ('Chest Fly Machine',         'chest',      'machine',    false),
    ('Cable Crossover',           'chest',      'cable',      false),
    ('Push-up',                   'chest',      'bodyweight', false),
    ('Deadlift',                  'back',       'barbell',    false),
    ('Barbell Row',               'back',       'barbell',    false),
    ('Dumbbell Row',              'back',       'dumbbell',   false),
    ('Lat Pulldown',              'back',       'cable',      false),
    ('Seated Cable Row',          'back',       'cable',      false),
    ('Pull-up',                   'back',       'bodyweight', false),
    ('Overhead Press',            'shoulders',  'barbell',    false),
    ('Dumbbell Shoulder Press',   'shoulders',  'dumbbell',   false),
    ('Lateral Raise',             'shoulders',  'dumbbell',   false),
    ('Face Pull',                 'shoulders',  'cable',      false),
    ('Shoulder Press Machine',    'shoulders',  'machine',    false),
    ('Barbell Curl',              'biceps',     'barbell',    false),
    ('Dumbbell Curl',             'biceps',     'dumbbell',   false),
    ('Hammer Curl',               'biceps',     'dumbbell',   false),
    ('Cable Curl',                'biceps',     'cable',      false),
    ('Triceps Pushdown',          'triceps',    'cable',      false),
    ('Skull Crusher',             'triceps',    'barbell',    false),
    ('Overhead Triceps Extension','triceps',    'dumbbell',   false),
    ('Dip',                       'triceps',    'bodyweight', false),
    ('Wrist Curl',                'forearms',   'dumbbell',   false),
    ('Farmer''s Carry',           'forearms',   'dumbbell',   false),
    ('Plank',                     'abs',        'bodyweight', false),
    ('Hanging Leg Raise',         'abs',        'bodyweight', false),
    ('Cable Crunch',              'abs',        'cable',      false),
    ('Back Squat',                'quads',      'barbell',    false),
    ('Front Squat',               'quads',      'barbell',    false),
    ('Leg Press',                 'quads',      'machine',    false),
    ('Leg Extension',             'quads',      'machine',    false),
    ('Goblet Squat',              'quads',      'kettlebell', false),
    ('Romanian Deadlift',         'hamstrings', 'barbell',    false),
    ('Lying Leg Curl',            'hamstrings', 'machine',    false),
    ('Hip Thrust',                'glutes',     'barbell',    false),
    ('Bulgarian Split Squat',     'glutes',     'dumbbell',   false),
    ('Glute Kickback',            'glutes',     'cable',      false),
    ('Banded Glute Bridge',       'glutes',     'band',       false),
    ('Standing Calf Raise',       'calves',     'machine',    false),
    ('Seated Calf Raise',         'calves',     'machine',    false),
    ('Kettlebell Swing',          'full_body',  'kettlebell', false),
    ('Clean and Press',           'full_body',  'barbell',    false),
    ('Burpee',                    'full_body',  'bodyweight', false);

-- +goose Down
DROP TABLE exercise_media;
DROP TABLE exercises;
