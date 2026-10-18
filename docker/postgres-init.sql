-- Runs once, when the data volume is first created.
-- The integration tests use their own database so they never touch dev data.
CREATE DATABASE fitness_test OWNER fitness;
