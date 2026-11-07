package workout

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// ProfileCounts are the counts on a User's Profile: their finished
// Sessions, the Personal records those set, and their Streak.
type ProfileCounts struct {
	Workouts        int `json:"workouts"`
	PersonalRecords int `json:"personalRecords"`
	Streak          int `json:"streak"`
}

// ProfileCounts works out accountID's ProfileCounts as of now, with weeks
// starting on Monday in loc, where the User is. Records are worked out from
// Sets (ADR 0007). The user module uses it through user.Workouts.
func (s *Service) ProfileCounts(ctx context.Context, accountID uuid.UUID, loc *time.Location, now time.Time) (ProfileCounts, error) {
	finished, err := s.queries.ListFinishedTimes(ctx, accountID)
	if err != nil {
		return ProfileCounts{}, fmt.Errorf("list finished times: %w", err)
	}
	exerciseIDs, err := s.queries.ListFinishedExerciseIDs(ctx, accountID)
	if err != nil {
		return ProfileCounts{}, fmt.Errorf("list finished exercises: %w", err)
	}
	// The unit only shows in the records' Estimated 1RMs, which aren't used.
	records, _, err := s.handlers().personalRecords(ctx, accountID, exerciseIDs, "kg", nil)
	if err != nil {
		return ProfileCounts{}, err
	}
	var recordCount int
	for _, list := range records {
		recordCount += len(list)
	}
	return ProfileCounts{
		Workouts:        len(finished),
		PersonalRecords: recordCount,
		Streak:          streak(finished, loc, now),
	}, nil
}

// streak is how many weeks in a row, up to now's, have a time in finished,
// with weeks starting on Monday in loc. Now's week counts once it has one;
// until then, it's not over, so the Streak runs up to the week before.
func streak(finished []time.Time, loc *time.Location, now time.Time) int {
	weeks := make(map[time.Time]bool, len(finished))
	for _, t := range finished {
		weeks[weekOf(t, loc)] = true
	}
	week := weekOf(now, loc)
	if !weeks[week] {
		week = week.AddDate(0, 0, -7)
	}
	n := 0
	for ; weeks[week]; week = week.AddDate(0, 0, -7) {
		n++
	}
	return n
}

// weekOf is the Monday of t's week in loc, as a UTC midnight, so weeks
// compare and step by days whatever the clocks did.
func weekOf(t time.Time, loc *time.Location) time.Time {
	local := t.In(loc)
	return time.Date(local.Year(), local.Month(), local.Day()-(int(local.Weekday())+6)%7, 0, 0, 0, 0, time.UTC)
}
