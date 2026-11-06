-- +goose Up

-- What a User adds to a finished Session's Post. Owned by the feed module.
-- A Post shares its Session's id and exists as soon as the Session is
-- finished; a row here appears only once the User first sets a caption or a
-- Progress photo, so a finished Session with no row is a Post with neither
-- (ADR 0008). account_id is the Post's owner, kept so the feed can list a
-- User's Posts without reading the workout module's tables.
CREATE TABLE posts (
    session_id uuid PRIMARY KEY REFERENCES workout_sessions (id) ON DELETE CASCADE,
    account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    caption    text NOT NULL DEFAULT '' CHECK (char_length(caption) <= 2200)
);

CREATE INDEX posts_account_id_idx ON posts (account_id);

-- A Post's optional Progress photo, at most 10 MB, stored like Exercise media
-- (ADR 0003).
CREATE TABLE post_photos (
    session_id   uuid PRIMARY KEY REFERENCES posts (session_id) ON DELETE CASCADE,
    content_type text NOT NULL,
    data         bytea NOT NULL,
    updated_at   timestamptz NOT NULL DEFAULT now()
);

-- +goose Down

DROP TABLE post_photos;
DROP TABLE posts;
