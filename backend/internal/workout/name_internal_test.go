package workout

import (
	"strings"
	"testing"
	"time"
)

func TestGivenName(t *testing.T) {
	chicago, err := time.LoadLocation("America/Chicago")
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		routine string
		at      string // UTC
		want    string
	}{
		{"", "2026-11-05T15:30:00Z", "Thursday's Morning Workout"},   // 9:30
		{"", "2026-11-05T11:00:00Z", "Thursday's Morning Workout"},   // 5:00
		{"", "2026-11-05T10:59:00Z", "Thursday's Night Workout"},     // 4:59
		{"", "2026-11-05T18:00:00Z", "Thursday's Afternoon Workout"}, // 12:00
		{"", "2026-11-05T23:00:00Z", "Thursday's Evening Workout"},   // 17:00
		{"", "2026-11-06T03:00:00Z", "Thursday's Night Workout"},     // 21:00
		{"", "2026-11-06T06:30:00Z", "Friday's Night Workout"},       // 0:30
		{"Push day", "2026-11-05T15:30:00Z", "Push day"},
		{strings.Repeat("a", 100), "2026-11-05T15:30:00Z", strings.Repeat("a", 60)},
	}
	for _, c := range cases {
		at, _ := time.Parse(time.RFC3339, c.at)
		if got := givenName(c.routine, at, chicago); got != c.want {
			t.Errorf("givenName(%q, %s in Chicago) = %q, want %q", c.routine, c.at, got, c.want)
		}
	}
}
