package user

import (
	"net/http"
	"time"

	"github.com/KolesnikovP/fitness_app/backend/internal/auth"
	"github.com/KolesnikovP/fitness_app/backend/internal/platform/httpx"
)

// counts serves the caller's Profile counts, with weeks starting on Monday
// in ?timeZone, the IANA time zone the User is in.
func (h handlers) counts(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("timeZone")
	loc, err := time.LoadLocation(name)
	if name == "" || err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid_time_zone", "Send timeZone as an IANA time zone, such as Europe/Berlin.")
		return
	}
	id, _ := auth.AccountID(r.Context())
	counts, err := h.workouts.ProfileCounts(r.Context(), id, loc, h.now())
	if err != nil {
		httpx.WriteInternalError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, counts)
}
