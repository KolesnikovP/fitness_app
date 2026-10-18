package auth_test

import (
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/KolesnikovP/fitness_app/backend/internal/auth"
	"github.com/KolesnikovP/fitness_app/backend/internal/testutil"
)

func TestHealthz(t *testing.T) {
	srv := testutil.NewServer(t)

	res := testutil.Do(t, srv, http.MethodGet, "/healthz", "", nil)

	if res.Status != http.StatusOK {
		t.Fatalf("status = %d, want 200", res.Status)
	}
}

func TestSignUp(t *testing.T) {
	srv := testutil.NewServer(t)

	t.Run("creates an account and returns a token", func(t *testing.T) {
		email := testutil.UniqueEmail(t)

		res := testutil.Do(t, srv, http.MethodPost, "/auth/signup", "", map[string]string{
			"email": email, "password": "correct-horse-battery",
		})

		if res.Status != http.StatusCreated {
			t.Fatalf("status = %d, want 201; body %v", res.Status, res.Body)
		}
		if tok, _ := res.Body["token"].(string); tok == "" {
			t.Errorf("token missing: %v", res.Body)
		}
		account, _ := res.Body["account"].(map[string]any)
		if account["email"] != email {
			t.Errorf("account.email = %v, want %q", account["email"], email)
		}
		if id, _ := account["id"].(string); uuid.Validate(id) != nil {
			t.Errorf("account.id = %v, want a UUID", account["id"])
		}
		if _, leaked := account["passwordHash"]; leaked {
			t.Error("response leaks the password hash")
		}
	})

	t.Run("rejects an email that is already taken, ignoring case", func(t *testing.T) {
		email, _, _ := testutil.SignUp(t, srv)

		res := testutil.Do(t, srv, http.MethodPost, "/auth/signup", "", map[string]string{
			"email": strings.ToUpper(email), "password": "another-password",
		})

		if res.Status != http.StatusConflict || res.ErrorCode() != "email_taken" {
			t.Fatalf("got %d %q, want 409 email_taken", res.Status, res.ErrorCode())
		}
	})

	invalid := []struct {
		name, email, password, code string
	}{
		{"malformed email", "not-an-email", "correct-horse-battery", "invalid_email"},
		{"empty email", "", "correct-horse-battery", "invalid_email"},
		{"short password", "", "short", "invalid_password"},
		{"password over bcrypt's 72-byte limit", "", strings.Repeat("a", 73), "invalid_password"},
	}
	for _, tc := range invalid {
		t.Run("rejects "+tc.name, func(t *testing.T) {
			email := tc.email
			if tc.code == "invalid_password" {
				email = testutil.UniqueEmail(t)
			}

			res := testutil.Do(t, srv, http.MethodPost, "/auth/signup", "", map[string]string{
				"email": email, "password": tc.password,
			})

			if res.Status != http.StatusBadRequest || res.ErrorCode() != tc.code {
				t.Fatalf("got %d %q, want 400 %s", res.Status, res.ErrorCode(), tc.code)
			}
		})
	}

	t.Run("rejects a body that is not JSON", func(t *testing.T) {
		res := testutil.Do(t, srv, http.MethodPost, "/auth/signup", "", "just a string")

		if res.Status != http.StatusBadRequest || res.ErrorCode() != "invalid_json" {
			t.Fatalf("got %d %q, want 400 invalid_json", res.Status, res.ErrorCode())
		}
	})
}

func TestLogIn(t *testing.T) {
	srv := testutil.NewServer(t)

	t.Run("returns a token for the right password", func(t *testing.T) {
		email, password, _ := testutil.SignUp(t, srv)

		res := testutil.Do(t, srv, http.MethodPost, "/auth/login", "", map[string]string{
			"email": email, "password": password,
		})

		if res.Status != http.StatusOK {
			t.Fatalf("status = %d, want 200; body %v", res.Status, res.Body)
		}
		if tok, _ := res.Body["token"].(string); tok == "" {
			t.Errorf("token missing: %v", res.Body)
		}
	})

	t.Run("matches the email regardless of case", func(t *testing.T) {
		email, password, _ := testutil.SignUp(t, srv)

		res := testutil.Do(t, srv, http.MethodPost, "/auth/login", "", map[string]string{
			"email": strings.ToUpper(email), "password": password,
		})

		if res.Status != http.StatusOK {
			t.Fatalf("status = %d, want 200", res.Status)
		}
	})

	t.Run("rejects a wrong password", func(t *testing.T) {
		email, _, _ := testutil.SignUp(t, srv)

		res := testutil.Do(t, srv, http.MethodPost, "/auth/login", "", map[string]string{
			"email": email, "password": "wrong-password",
		})

		if res.Status != http.StatusUnauthorized || res.ErrorCode() != "invalid_credentials" {
			t.Fatalf("got %d %q, want 401 invalid_credentials", res.Status, res.ErrorCode())
		}
	})

	t.Run("rejects an unknown email with the same error as a wrong password", func(t *testing.T) {
		res := testutil.Do(t, srv, http.MethodPost, "/auth/login", "", map[string]string{
			"email": testutil.UniqueEmail(t), "password": "correct-horse-battery",
		})

		if res.Status != http.StatusUnauthorized || res.ErrorCode() != "invalid_credentials" {
			t.Fatalf("got %d %q, want 401 invalid_credentials", res.Status, res.ErrorCode())
		}
	})
}

// GET /users/me is the simplest authenticated endpoint, so it stands in for
// "any authenticated request" when testing RequireAuth.
func TestAuthenticatedRequests(t *testing.T) {
	srv := testutil.NewServer(t)
	_, _, validToken := testutil.SignUp(t, srv)

	accepted := testutil.Do(t, srv, http.MethodGet, "/users/me", validToken, nil)
	if accepted.Status != http.StatusOK {
		t.Fatalf("valid token: status = %d, want 200; body %v", accepted.Status, accepted.Body)
	}

	someID := uuid.New()
	expired := issue(t, auth.NewTokens([]byte(testutil.JWTSecret), -time.Minute), someID)
	wrongSecret := issue(t, auth.NewTokens([]byte("a-different-secret-of-32-characters!"), time.Hour), someID)
	unknownAccount := issue(t, testutil.Tokens(), someID)

	rejected := []struct{ name, header string }{
		{"no Authorization header", ""},
		{"not a Bearer token", "Basic " + validToken},
		{"malformed token", "Bearer not.a.jwt"},
		{"expired token", "Bearer " + expired},
		{"token signed with another secret", "Bearer " + wrongSecret},
		{"token for an account that does not exist", "Bearer " + unknownAccount},
	}
	for _, tc := range rejected {
		t.Run("rejects "+tc.name, func(t *testing.T) {
			req, _ := http.NewRequest(http.MethodGet, srv.URL+"/users/me", nil)
			if tc.header != "" {
				req.Header.Set("Authorization", tc.header)
			}
			res, err := srv.Client().Do(req)
			if err != nil {
				t.Fatal(err)
			}
			res.Body.Close()

			if res.StatusCode != http.StatusUnauthorized {
				t.Fatalf("status = %d, want 401", res.StatusCode)
			}
		})
	}
}

func issue(t *testing.T, tokens *auth.Tokens, id uuid.UUID) string {
	t.Helper()
	tok, err := tokens.Issue(id)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}
	return tok
}
