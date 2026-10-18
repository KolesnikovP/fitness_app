-- +goose Up

-- Login identity. Owned by the auth module.
CREATE TABLE accounts (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email         text NOT NULL,
    password_hash text NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX accounts_email_key ON accounts (lower(email));

-- User-facing settings. Owned by the user module.
-- A null unit_preference means the user has not finished onboarding.
CREATE TABLE profiles (
    account_id      uuid PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
    unit_preference text CHECK (unit_preference IN ('kg', 'lb')),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE profiles;
DROP TABLE accounts;
