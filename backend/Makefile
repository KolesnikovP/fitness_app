.PHONY: db-up db-down run dev test sqlc vet

# Dev-only secret. Set your own JWT_SECRET anywhere outside your machine.
DEV_JWT_SECRET := dev-only-secret-change-me-0123456789

db-up:
	docker compose -f ../docker-compose.yml up -d --wait

db-down:
	docker compose -f ../docker-compose.yml down

run:
	JWT_SECRET=$${JWT_SECRET:-$(DEV_JWT_SECRET)} go run ./cmd/api

# Restarts the API on every .go or .sql change; logs to tmp/api.log too.
dev:
	JWT_SECRET=$${JWT_SECRET:-$(DEV_JWT_SECRET)} ./scripts/dev.sh

test:
	go test -race ./...

sqlc:
	go tool sqlc generate

vet:
	go vet ./...
