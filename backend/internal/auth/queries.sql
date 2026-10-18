-- name: CreateAccount :one
INSERT INTO accounts (email, password_hash)
VALUES ($1, $2)
RETURNING id, email;

-- name: GetAccountByEmail :one
SELECT id, email, password_hash
FROM accounts
WHERE lower(email) = lower(sqlc.arg(email));

-- name: GetAccountByID :one
SELECT id, email
FROM accounts
WHERE id = $1;
