-- +goose Up

-- A Set's type: a normal working Set unless marked a warm-up, a failure Set
-- or a drop Set. Warm-ups count toward no Volume, Best, Personal record or
-- Record tier.
ALTER TABLE session_sets
    ADD COLUMN set_type text NOT NULL DEFAULT 'normal'
        CHECK (set_type IN ('normal', 'warmup', 'failure', 'drop'));

-- +goose Down
ALTER TABLE session_sets DROP COLUMN set_type;
