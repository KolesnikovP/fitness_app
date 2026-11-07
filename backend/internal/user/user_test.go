package user_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/KolesnikovP/fitness_app/backend/internal/testutil"
)

func TestGetMe(t *testing.T) {
	srv := testutil.NewServer(t)

	t.Run("a new account has no unit preference yet", func(t *testing.T) {
		email, _, token := testutil.SignUp(t, srv)

		res := testutil.Do(t, srv, http.MethodGet, "/users/me", token, nil)

		if res.Status != http.StatusOK {
			t.Fatalf("status = %d, want 200; body %v", res.Status, res.Body)
		}
		if res.Body["email"] != email {
			t.Errorf("email = %v, want %q", res.Body["email"], email)
		}
		pref, present := res.Body["unitPreference"]
		if !present || pref != nil {
			t.Errorf("unitPreference = %v (present=%v), want null", pref, present)
		}
	})

	t.Run("requires a token", func(t *testing.T) {
		res := testutil.Do(t, srv, http.MethodGet, "/users/me", "", nil)

		if res.Status != http.StatusUnauthorized {
			t.Fatalf("status = %d, want 401", res.Status)
		}
	})
}

func TestSetUnitPreference(t *testing.T) {
	srv := testutil.NewServer(t)

	t.Run("sets and then changes the preference", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)

		for _, unit := range []string{"kg", "lb"} {
			res := testutil.Do(t, srv, http.MethodPatch, "/users/me", token, map[string]string{"unitPreference": unit})
			if res.Status != http.StatusOK || res.Body["unitPreference"] != unit {
				t.Fatalf("PATCH %s: got %d %v", unit, res.Status, res.Body)
			}

			got := testutil.Do(t, srv, http.MethodGet, "/users/me", token, nil)
			if got.Body["unitPreference"] != unit {
				t.Fatalf("GET after PATCH %s: unitPreference = %v", unit, got.Body["unitPreference"])
			}
		}
	})

	t.Run("only changes the caller's own profile", func(t *testing.T) {
		_, _, mine := testutil.SignUp(t, srv)
		_, _, theirs := testutil.SignUp(t, srv)

		testutil.Do(t, srv, http.MethodPatch, "/users/me", mine, map[string]string{"unitPreference": "kg"})

		other := testutil.Do(t, srv, http.MethodGet, "/users/me", theirs, nil)
		if other.Body["unitPreference"] != nil {
			t.Fatalf("other account's unitPreference = %v, want null", other.Body["unitPreference"])
		}
	})

	for _, bad := range []any{"stone", "", "KG", nil} {
		t.Run("rejects an invalid value", func(t *testing.T) {
			_, _, token := testutil.SignUp(t, srv)

			res := testutil.Do(t, srv, http.MethodPatch, "/users/me", token, map[string]any{"unitPreference": bad})

			if res.Status != http.StatusBadRequest || res.ErrorCode() != "invalid_unit_preference" {
				t.Fatalf("value %#v: got %d %q, want 400 invalid_unit_preference", bad, res.Status, res.ErrorCode())
			}
		})
	}

	t.Run("requires a token", func(t *testing.T) {
		res := testutil.Do(t, srv, http.MethodPatch, "/users/me", "", map[string]string{"unitPreference": "kg"})

		if res.Status != http.StatusUnauthorized {
			t.Fatalf("status = %d, want 401", res.Status)
		}
	})
}

func TestProfileName(t *testing.T) {
	srv := testutil.NewServer(t)

	t.Run("a new User is named after their email until they choose a name", func(t *testing.T) {
		email, _, token := testutil.SignUp(t, srv)

		res := testutil.Do(t, srv, http.MethodGet, "/users/me", token, nil)

		if want := strings.Split(email, "@")[0]; res.Body["name"] != want {
			t.Fatalf("name = %v, want %q", res.Body["name"], want)
		}
	})

	t.Run("sets the name, trimmed, and keeps the unit preference", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		testutil.Do(t, srv, http.MethodPatch, "/users/me", token, map[string]string{"unitPreference": "lb"})

		res := testutil.Do(t, srv, http.MethodPatch, "/users/me", token, map[string]string{"name": "  Petr K  "})

		if res.Status != http.StatusOK || res.Body["name"] != "Petr K" || res.Body["unitPreference"] != "lb" {
			t.Fatalf("got %d %v, want name Petr K and unitPreference lb", res.Status, res.Body)
		}
		if got := testutil.Do(t, srv, http.MethodGet, "/users/me", token, nil); got.Body["name"] != "Petr K" {
			t.Fatalf("GET after PATCH: name = %v", got.Body["name"])
		}
	})

	t.Run("a cleared name goes back to the one from the email", func(t *testing.T) {
		email, _, token := testutil.SignUp(t, srv)
		testutil.Do(t, srv, http.MethodPatch, "/users/me", token, map[string]string{"name": "Petr"})

		res := testutil.Do(t, srv, http.MethodPatch, "/users/me", token, map[string]string{"name": "   "})

		if want := strings.Split(email, "@")[0]; res.Status != http.StatusOK || res.Body["name"] != want {
			t.Fatalf("got %d %v, want name %q", res.Status, res.Body, want)
		}
	})

	t.Run("names are at most 50 characters", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)

		ok := testutil.Do(t, srv, http.MethodPatch, "/users/me", token, map[string]string{"name": strings.Repeat("é", 50)})
		long := testutil.Do(t, srv, http.MethodPatch, "/users/me", token, map[string]string{"name": strings.Repeat("é", 51)})

		if ok.Status != http.StatusOK {
			t.Fatalf("50 characters: got %d %v, want 200", ok.Status, ok.Body)
		}
		if long.Status != http.StatusBadRequest || long.ErrorCode() != "name_too_long" {
			t.Fatalf("51 characters: got %d %q, want 400 name_too_long", long.Status, long.ErrorCode())
		}
	})

	t.Run("only renames the caller", func(t *testing.T) {
		_, _, mine := testutil.SignUp(t, srv)
		theirEmail, _, theirs := testutil.SignUp(t, srv)

		testutil.Do(t, srv, http.MethodPatch, "/users/me", mine, map[string]string{"name": "Petr"})

		if got := testutil.Do(t, srv, http.MethodGet, "/users/me", theirs, nil); got.Body["name"] != strings.Split(theirEmail, "@")[0] {
			t.Fatalf("other User's name = %v", got.Body["name"])
		}
	})
}
