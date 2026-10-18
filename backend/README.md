# Backend

Go HTTP API backed by Postgres.

## Run it

```sh
make db-up   # start Postgres in Docker (creates the fitness and fitness_test databases)
make run     # start the API on :8080; migrations apply on startup
make test    # integration tests against fitness_test
```

## Environment

| Variable | Default | Notes |
|---|---|---|
| `JWT_SECRET` | none (`make run` sets a dev value) | Required, at least 32 characters |
| `DATABASE_URL` | `postgres://fitness:fitness@localhost:5432/fitness?sslmode=disable` | |
| `PORT` | `8080` | |
| `TOKEN_TTL` | `720h` (30 days) | Any Go duration |
| `TEST_DATABASE_URL` | `postgres://fitness:fitness@localhost:5432/fitness_test?sslmode=disable` | Tests only |

## Layout

- `cmd/api`: entry point.
- `internal/app`: wires every module's routes into one handler.
- `internal/<module>`: one package per domain area (`auth`, `user`, ...). Each module:
  - owns its own tables;
  - keeps its SQL in `queries.sql`, with sqlc-generated code in `store/`;
  - is tested at the HTTP boundary in `<module>_test.go`.
- `internal/platform`: shared plumbing (config, database, JSON helpers).
- `migrations`: goose SQL migrations, embedded into the binary.

Modules never read each other's tables. When one module needs another's data, it goes through a Go interface (for example `user.Accounts`).

## Changing the schema or queries

1. Add a migration, `migrations/0000N_name.sql`, in goose format.
2. Edit the module's `queries.sql`.
3. Run `make sqlc`, and commit the regenerated `store/` code.

## Tests

Tests run the full router against the real `fitness_test` database (`net/http/httptest`); nothing is mocked. They never truncate tables: each test creates its own accounts with `testutil.UniqueEmail`, so test packages can run in parallel.
