package workout

import (
	"fmt"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"
	// Time zones are named by the client; embed the database so they load on
	// a server image without one.
	_ "time/tzdata"

	"github.com/google/uuid"

	"github.com/KolesnikovP/fitness_app/backend/internal/platform/httpx"
	"github.com/KolesnikovP/fitness_app/backend/internal/workout/store"
)

// MaxNameChars is the most characters a Session name has.
const MaxNameChars = 60

// givenName is what a Session is called when it starts: its Routine's name
// (its first MaxNameChars characters), or for a freeform Session, with
// routineName empty, the weekday and part of the day it started in loc, such
// as "Thursday's Morning Workout".
func givenName(routineName string, startedAt time.Time, loc *time.Location) string {
	if routineName != "" {
		return truncate(routineName, MaxNameChars)
	}
	local := startedAt.In(loc)
	return fmt.Sprintf("%s's %s Workout", local.Weekday(), partOfDay(local.Hour()))
}

// partOfDay is "Morning" from 5:00, "Afternoon" from 12:00, "Evening" from
// 17:00 and "Night" from 21:00.
func partOfDay(hour int) string {
	switch {
	case hour >= 5 && hour < 12:
		return "Morning"
	case hour >= 12 && hour < 17:
		return "Afternoon"
	case hour >= 17 && hour < 21:
		return "Evening"
	default:
		return "Night"
	}
}

// timeZone loads the IANA time zone the client named, or UTC if it named
// none or one this server doesn't know.
func timeZone(name *string) *time.Location {
	if name == nil {
		return time.UTC
	}
	loc, err := time.LoadLocation(*name)
	if err != nil || *name == "" || strings.EqualFold(*name, "local") {
		return time.UTC
	}
	return loc
}

func truncate(s string, chars int) string {
	if utf8.RuneCountInString(s) <= chars {
		return s
	}
	return string([]rune(s)[:chars])
}

// renameBody's Name is required: a body without one is refused, rather
// than read as clearing the name.
type renameBody struct {
	Name *string `json:"name"`
}

// rename renames one of the caller's Sessions, in progress or finished. A
// blank name clears it, so the Session is called the name it was given.
// Its Routine keeps its own name.
func (h handlers) rename(w http.ResponseWriter, r *http.Request) {
	var body renameBody
	if !httpx.DecodeJSON(w, r, &body) {
		return
	}
	if body.Name == nil {
		httpx.WriteError(w, http.StatusBadRequest, "missing_name", `Send the name as "name"; an empty one clears it.`)
		return
	}
	name := strings.TrimSpace(*body.Name)
	if utf8.RuneCountInString(name) > MaxNameChars {
		httpx.WriteError(w, http.StatusBadRequest, "name_too_long",
			fmt.Sprintf("Workout names can be at most %d characters.", MaxNameChars))
		return
	}
	var stored *string
	if name != "" {
		stored = &name
	}
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeSessionNotFound(w)
		return
	}
	renamed, err := h.queries.RenameSession(r.Context(), store.RenameSessionParams{
		Name: stored, ID: id, AccountID: callerOf(r),
	})
	if err != nil {
		httpx.WriteInternalError(w, r, fmt.Errorf("rename session: %w", err))
		return
	}
	if renamed == 0 {
		writeSessionNotFound(w)
		return
	}
	h.writeSession(w, r, http.StatusOK, id)
}
