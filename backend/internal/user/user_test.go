package user_test

import (
	"net/http"
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
