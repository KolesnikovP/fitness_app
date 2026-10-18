-- +goose Up

-- Rename to the domain glossary's terms: "equipment type" and "animated demo".
ALTER TABLE exercises RENAME COLUMN equipment TO equipment_type;

ALTER TABLE exercise_media DROP CONSTRAINT exercise_media_kind_check;
UPDATE exercise_media SET kind = 'animated_demo' WHERE kind = 'animation';
ALTER TABLE exercise_media ADD CONSTRAINT exercise_media_kind_check CHECK (kind IN ('image', 'animated_demo'));

-- +goose Down
ALTER TABLE exercise_media DROP CONSTRAINT exercise_media_kind_check;
UPDATE exercise_media SET kind = 'animation' WHERE kind = 'animated_demo';
ALTER TABLE exercise_media ADD CONSTRAINT exercise_media_kind_check CHECK (kind IN ('image', 'animation'));

ALTER TABLE exercises RENAME COLUMN equipment_type TO equipment;
