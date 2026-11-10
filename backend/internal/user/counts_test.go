package user_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/KolesnikovP/fitness_app/backend/internal/testutil"
)

// TestProfileCounts runs on a server pinned to now: once inside the Monday
// 00:00–06:00 UTC window, where Chicago is still on Sunday and in UTC's last
// week, and once mid-week, where they're in the same week.
func TestProfileCounts(t *testing.T) {
	for _, tc := range []struct {
		name string
		now  time.Time
	}{
		{"early Monday UTC, still Sunday in Chicago", time.Date(2026, 11, 9, 2, 57, 0, 0, time.UTC)},
		{"mid-week", time.Date(2026, 11, 4, 12, 0, 0, 0, time.UTC)},
	} {
		t.Run(tc.name, func(t *testing.T) { profileCountsAt(t, tc.now) })
	}
}

// TestProfileCountsRealClock checks that by default the server counts
// against the real time: a workout finished just now is this week's.
func TestProfileCountsRealClock(t *testing.T) {
	srv := testutil.NewServer(t)
	_, _, token := testutil.SignUp(t, srv)
	logWorkout(t, srv, token, "Back Squat", 100, 5)

	wantCounts(t, counts(t, srv, token, "UTC"), 1, 0, 1)
}

// profileCountsAt runs the Profile counts cases on a server pinned to now.
func profileCountsAt(t *testing.T, now time.Time) {
	srv := testutil.NewServerAt(t, now)
	week := 7 * 24 * time.Hour

	t.Run("a new User has done nothing yet", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)

		res := counts(t, srv, token, "UTC")

		wantCounts(t, res, 0, 0, 0)
	})

	t.Run("counts finished workouts and the Personal records they set", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		// In the order logged, finished 2, 1 and 0 minutes before now. 105
		// sets an Estimated 1RM record and a rep record at 5 reps.
		finishAt(t, logWorkout(t, srv, token, "Bench Press", 100, 5), now.Add(-2*time.Minute))
		finishAt(t, logWorkout(t, srv, token, "Bench Press", 105, 5), now.Add(-time.Minute))
		finishAt(t, logWorkout(t, srv, token, "Bench Press", 90, 5), now)
		startSession(t, srv, token) // In progress: not a finished workout.

		wantCounts(t, counts(t, srv, token, "UTC"), 3, 2, 1)
	})

	t.Run("the Streak counts this week once it has a workout", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		for _, ago := range []time.Duration{0, week, 2 * week} {
			finishAt(t, logWorkout(t, srv, token, "Back Squat", 100, 5), now.Add(-ago))
		}

		wantCounts(t, counts(t, srv, token, "UTC"), 3, 0, 3)
	})

	t.Run("a week with no workout breaks the Streak", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		for _, ago := range []time.Duration{0, 2 * week, 3 * week} {
			finishAt(t, logWorkout(t, srv, token, "Back Squat", 100, 5), now.Add(-ago))
		}

		wantCounts(t, counts(t, srv, token, "UTC"), 3, 0, 1)
	})

	t.Run("this week doesn't break the Streak before it's over", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		for _, ago := range []time.Duration{week, 2 * week} {
			finishAt(t, logWorkout(t, srv, token, "Back Squat", 100, 5), now.Add(-ago))
		}

		wantCounts(t, counts(t, srv, token, "UTC"), 2, 0, 2)
	})

	t.Run("weeks start on Monday where the User is", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)
		// 00:30 UTC on this week's Monday in UTC, which in Chicago is still
		// the Sunday before, and noon on the Monday two weeks before that.
		// In UTC the week between has no workout; in Chicago the first
		// workout falls in it.
		utcNow := now.UTC()
		monday := time.Date(utcNow.Year(), utcNow.Month(), utcNow.Day()-(int(utcNow.Weekday())+6)%7, 0, 30, 0, 0, time.UTC)
		finishAt(t, logWorkout(t, srv, token, "Back Squat", 100, 5), monday)
		finishAt(t, logWorkout(t, srv, token, "Back Squat", 100, 5), monday.AddDate(0, 0, -14).Add(11*time.Hour+30*time.Minute))

		wantCounts(t, counts(t, srv, token, "UTC"), 2, 0, 1)
		wantCounts(t, counts(t, srv, token, "America/Chicago"), 2, 0, 2)
	})

	t.Run("rejects an unknown time zone", func(t *testing.T) {
		_, _, token := testutil.SignUp(t, srv)

		res := counts(t, srv, token, "Mars/Olympus_Mons")

		if res.Status != http.StatusBadRequest || res.ErrorCode() != "invalid_time_zone" {
			t.Fatalf("got %d %q, want 400 invalid_time_zone", res.Status, res.ErrorCode())
		}
	})

	t.Run("counts only the caller's workouts", func(t *testing.T) {
		_, _, mine := testutil.SignUp(t, srv)
		_, _, theirs := testutil.SignUp(t, srv)
		finishAt(t, logWorkout(t, srv, mine, "Bench Press", 100, 5), now)

		wantCounts(t, counts(t, srv, theirs, "UTC"), 0, 0, 0)
	})

	t.Run("requires a token", func(t *testing.T) {
		if res := counts(t, srv, "", "UTC"); res.Status != http.StatusUnauthorized {
			t.Fatalf("status %d, want 401", res.Status)
		}
	})
}

func counts(t *testing.T, srv *httptest.Server, token, timeZone string) testutil.Response {
	t.Helper()
	return testutil.Do(t, srv, http.MethodGet, "/users/me/counts?timeZone="+url.QueryEscape(timeZone), token, nil)
}

func wantCounts(t *testing.T, res testutil.Response, workouts, personalRecords, streak float64) {
	t.Helper()
	if res.Status != http.StatusOK {
		t.Fatalf("counts: status %d, body %v", res.Status, res.Body)
	}
	if res.Body["workouts"] != workouts || res.Body["personalRecords"] != personalRecords || res.Body["streak"] != streak {
		t.Fatalf("counts = %v, want %v workouts, %v personal records, a Streak of %v",
			res.Body, workouts, personalRecords, streak)
	}
}

// logWorkout logs a finished Session of one Set of exercise at weight kg ×
// reps, and returns its id.
func logWorkout(t *testing.T, srv *httptest.Server, token, exercise string, weight float64, reps int) string {
	t.Helper()
	id := startSession(t, srv, token)
	res := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions/"+id+"/exercises", token,
		map[string]string{"exerciseId": exerciseID(t, srv, token, exercise)})
	if res.Status != http.StatusCreated {
		t.Fatalf("add exercise: status %d, body %v", res.Status, res.Body)
	}
	exercises := res.Body["exercises"].([]any)
	sessionExercise := exercises[len(exercises)-1].(map[string]any)["id"].(string)
	res = testutil.Do(t, srv, http.MethodPost, "/workouts/sessions/"+id+"/exercises/"+sessionExercise+"/sets", token,
		map[string]any{"weight": weight, "weightUnit": "kg", "reps": reps})
	if res.Status != http.StatusCreated {
		t.Fatalf("log set: status %d, body %v", res.Status, res.Body)
	}
	if res := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions/"+id+"/finish", token, nil); res.Status != http.StatusOK {
		t.Fatalf("finish: status %d, body %v", res.Status, res.Body)
	}
	return id
}

func startSession(t *testing.T, srv *httptest.Server, token string) string {
	t.Helper()
	res := testutil.Do(t, srv, http.MethodPost, "/workouts/sessions", token, nil)
	if res.Status != http.StatusCreated {
		t.Fatalf("start session: status %d, body %v", res.Status, res.Body)
	}
	return res.Body["id"].(string)
}

func exerciseID(t *testing.T, srv *httptest.Server, token, name string) string {
	t.Helper()
	res := testutil.Do(t, srv, http.MethodGet, "/exercises?q="+url.QueryEscape(name), token, nil)
	for _, e := range res.Body["exercises"].([]any) {
		if e := e.(map[string]any); e["name"] == name {
			return e["id"].(string)
		}
	}
	t.Fatalf("no exercise named %q", name)
	return ""
}

// finishAt backdates a finished Session, which the API stamps with now, to
// an hour long and finished at finished.
func finishAt(t *testing.T, sessionID string, finished time.Time) {
	t.Helper()
	_, err := testutil.Pool(t).Exec(context.Background(),
		"UPDATE workout_sessions SET started_at = $2, finished_at = $3 WHERE id = $1",
		sessionID, finished.Add(-time.Hour), finished)
	if err != nil {
		t.Fatalf("backdate session: %v", err)
	}
}
