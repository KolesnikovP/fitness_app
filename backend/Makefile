.PHONY: db-up db-down run test sqlc vet

# Dev-only secret. Set your own JWT_SECRET anywhere outside your machine.
DEV_JWT_SECRET := dev-only-secret-change-me-0123456789

db-up:
	docker compose -f ../docker-compose.yml up -d --wait

db-down:
	docker compose -f ../docker-compose.yml down

run:
	JWT_SECRET=$${JWT_SECRET:-$(DEV_JWT_SECRET)} go run ./cmd/api

test:
	go test -race ./...

sqlc:
	go tool sqlc generate

vet:
	go vet ./...
