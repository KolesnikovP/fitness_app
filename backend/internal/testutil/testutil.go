// Package testutil runs the real API against the fitness_test database for
// handler-level integration tests.
//
// Tests never truncate tables. Each test creates its own accounts with
// UniqueEmail, so test packages can run in parallel against one database.
package testutil

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/KolesnikovP/fitness_app/backend/internal/app"
	"github.com/KolesnikovP/fitness_app/backend/internal/auth"
	"github.com/KolesnikovP/fitness_app/backend/internal/platform/db"
)

const (
	JWTSecret          = "test-secret-that-is-at-least-32-chars"
	TokenTTL           = time.Hour
	defaultTestDBURL   = "postgres://fitness:fitness@localhost:5432/fitness_test?sslmode=disable"
	testDBURLEnvVarKey = "TEST_DATABASE_URL"
)

var (
	poolOnce sync.Once
	pool     *pgxpool.Pool
	poolErr  error
)

// Pool returns a connection pool to the migrated test database, shared by
// every test in the package.
func Pool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	poolOnce.Do(func() {
		url := os.Getenv(testDBURLEnvVarKey)
		if url == "" {
			url = defaultTestDBURL
		}
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		pool, poolErr = db.Connect(ctx, url)
		if poolErr != nil {
			poolErr = fmt.Errorf("%w (is Postgres running? try `make db-up`)", poolErr)
			return
		}
		poolErr = db.Migrate(ctx, pool)
	})
	if poolErr != nil {
		t.Fatalf("test database: %v", poolErr)
	}
	return pool
}

// NewServer starts the full API router against the test database.
func NewServer(t *testing.T) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(app.NewHandler(Pool(t), Tokens()))
	t.Cleanup(srv.Close)
	return srv
}

// Tokens returns the token issuer the test server uses.
func Tokens() *auth.Tokens {
	return auth.NewTokens([]byte(JWTSecret), TokenTTL)
}

// UniqueEmail returns an email address no other test run will use.
func UniqueEmail(t *testing.T) string {
	t.Helper()
	name := strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			return r
		}
		return '-'
	}, strings.ToLower(t.Name()))
	if len(name) > 40 {
		name = name[:40]
	}
	return fmt.Sprintf("%s-%s@example.com", name, uuid.NewString()[:8])
}

// Response is a decoded JSON response.
type Response struct {
	Status int
	Body   map[string]any
}

// Do sends a JSON request. token may be empty; body may be nil.
func Do(t *testing.T, srv *httptest.Server, method, path, token string, body any) Response {
	t.Helper()

	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal request: %v", err)
		}
		reader = bytes.NewReader(raw)
	}

	req, err := http.NewRequest(method, srv.URL+path, reader)
	if err != nil {
		t.Fatalf("build request: %v", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	res, err := srv.Client().Do(req)
	if err != nil {
		t.Fatalf("%s %s: %v", method, path, err)
	}
	defer res.Body.Close()

	out := Response{Status: res.StatusCode}
	raw, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatalf("read response: %v", err)
	}
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &out.Body); err != nil {
			t.Fatalf("%s %s: response is not a JSON object: %s", method, path, raw)
		}
	}
	return out
}

// ErrorCode returns error.code from an error response, or "".
func (r Response) ErrorCode() string {
	e, _ := r.Body["error"].(map[string]any)
	code, _ := e["code"].(string)
	return code
}

// SignUp creates a fresh account and returns its email, password and token.
func SignUp(t *testing.T, srv *httptest.Server) (email, password, token string) {
	t.Helper()
	email, password = UniqueEmail(t), "correct-horse-battery"
	res := Do(t, srv, http.MethodPost, "/auth/signup", "", map[string]string{
		"email": email, "password": password,
	})
	if res.Status != http.StatusCreated {
		t.Fatalf("sign up: status %d, body %v", res.Status, res.Body)
	}
	token, _ = res.Body["token"].(string)
	if token == "" {
		t.Fatalf("sign up: no token in %v", res.Body)
	}
	return email, password, token
}
