-- +goose Up

-- A User's name, owned by the user module: null until they choose one, and
-- then shown in place of the part of their email before the @.
ALTER TABLE profiles
    ADD COLUMN name text CHECK (char_length(name) BETWEEN 1 AND 50);

-- A User's optional avatar, at most 10 MB, stored like Exercise media
-- (ADR 0003). Without one, the app shows their initials.
CREATE TABLE profile_avatars (
    account_id   uuid PRIMARY KEY REFERENCES profiles (account_id) ON DELETE CASCADE,
    content_type text NOT NULL,
    data         bytea NOT NULL,
    updated_at   timestamptz NOT NULL DEFAULT now()
);

-- +goose Down

DROP TABLE profile_avatars;
ALTER TABLE profiles DROP COLUMN name;
