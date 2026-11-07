-- +goose Up

-- A Session's name, owned by the workout module. given_name is set when the
-- Session starts: its Routine's name, or for a freeform Session the weekday
-- and part of the day it started where the User was ("Thursday's Morning
-- Workout"). name is what the User renamed it to, null until they do; the
-- Session is called name if set, else given_name. Neither changes when a
-- Routine is renamed.
ALTER TABLE workout_sessions
    ADD COLUMN given_name text CHECK (char_length(given_name) BETWEEN 1 AND 60),
    ADD COLUMN name       text CHECK (char_length(name) BETWEEN 1 AND 60);

-- Existing Sessions keep the name the app showed for them: their Routine's
-- name as it is now, or the weekday and part of the day they started. No
-- time zone was recorded for them, so that's worked out in America/Chicago,
-- where every User with Sessions so far trains. This one-off backfill reads
-- the program module's routines, as no running code may (ADR 0001): a
-- migration sees the whole schema, and this one runs before either module.
UPDATE workout_sessions s
SET given_name = coalesce(
    (SELECT left(r.name, 60) FROM routines r WHERE r.id = s.routine_id),
    to_char(s.started_at AT TIME ZONE 'America/Chicago', 'FMDay') || '''s ' ||
    CASE
        WHEN extract(hour FROM s.started_at AT TIME ZONE 'America/Chicago') BETWEEN 5 AND 11 THEN 'Morning'
        WHEN extract(hour FROM s.started_at AT TIME ZONE 'America/Chicago') BETWEEN 12 AND 16 THEN 'Afternoon'
        WHEN extract(hour FROM s.started_at AT TIME ZONE 'America/Chicago') BETWEEN 17 AND 20 THEN 'Evening'
        ELSE 'Night'
    END || ' Workout');

ALTER TABLE workout_sessions ALTER COLUMN given_name SET NOT NULL;

-- +goose Down

ALTER TABLE workout_sessions
    DROP COLUMN name,
    DROP COLUMN given_name;
