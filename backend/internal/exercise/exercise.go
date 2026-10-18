// Package exercise owns the exercise library: the canonical exercises every
// user sees, plus each user's own custom exercises and their media.
package exercise

import (
	"errors"
	"fmt"
	"net/http"
	"slices"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/KolesnikovP/fitness_app/backend/internal/auth"
	"github.com/KolesnikovP/fitness_app/backend/internal/exercise/store"
	"github.com/KolesnikovP/fitness_app/backend/internal/platform/httpx"
)

// Accounts is the part of the auth module this module depends on.
type Accounts interface {
	RequireAuth(next http.Handler) http.Handler
}

type Service struct {
	queries *store.Queries
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{queries: store.New(pool)}
}

// Exercise is one entry in the library as the API returns it. ImageURL and
// AnimatedDemoURL are API paths, null when the exercise has no such media.
type Exercise struct {
	ID              uuid.UUID `json:"id"`
	Name            string    `json:"name"`
	MuscleGroup     string    `json:"muscleGroup"`
	EquipmentType   string    `json:"equipmentType"`
	IsCustom        bool      `json:"isCustom"`
	ImageURL        *string   `json:"imageUrl"`
	AnimatedDemoURL *string   `json:"animatedDemoUrl"`
}

// newExercise builds the API shape from a query row. ListExercisesRow has
// the same fields, so list rows convert to this type.
func newExercise(row store.GetVisibleExerciseRow) Exercise {
	return Exercise{
		ID:              row.ID,
		Name:            row.Name,
		MuscleGroup:     row.MuscleGroup,
		EquipmentType:   row.EquipmentType,
		IsCustom:        row.IsCustom,
		ImageURL:        mediaURL(row.ID, kindImage, row.ImageUpdatedAt),
		AnimatedDemoURL: mediaURL(row.ID, kindAnimatedDemo, row.AnimatedDemoUpdatedAt),
	}
}

// The values the API accepts. They match the CHECK constraints on the
// exercises table.
var (
	muscleGroups = []string{
		"chest", "back", "shoulders", "biceps", "triceps", "forearms",
		"abs", "quads", "hamstrings", "glutes", "calves", "full_body",
	}
	equipmentTypes = []string{
		"barbell", "dumbbell", "machine", "cable", "bodyweight",
		"kettlebell", "band", "other",
	}
)

func writeInvalidMuscleGroup(w http.ResponseWriter) {
	httpx.WriteError(w, http.StatusBadRequest, "invalid_muscle_group",
		"muscleGroup must be one of: "+strings.Join(muscleGroups, ", ")+".")
}

func writeInvalidEquipmentType(w http.ResponseWriter) {
	httpx.WriteError(w, http.StatusBadRequest, "invalid_equipment_type",
		"equipment type must be one of: "+strings.Join(equipmentTypes, ", ")+".")
}

const (
	kindImage        = "image"
	kindAnimatedDemo = "animated_demo"
)

// mediaURL carries the upload time, so a replaced image gets a new URL and
// clients don't show a cached copy of the old one.
func mediaURL(id uuid.UUID, kind string, updatedAt pgtype.Timestamptz) *string {
	if !updatedAt.Valid {
		return nil
	}
	url := fmt.Sprintf("/exercises/%s/%s?v=%d", id, kind, updatedAt.Time.UnixMilli())
	return &url
}

func (s *Service) Routes(mux *http.ServeMux, accounts Accounts) {
	h := handlers{queries: s.queries}
	mux.Handle("GET /exercises", accounts.RequireAuth(http.HandlerFunc(h.list)))
	mux.Handle("POST /exercises", accounts.RequireAuth(http.HandlerFunc(h.create)))
	mux.Handle("GET /exercises/{id}", accounts.RequireAuth(http.HandlerFunc(h.get)))
	mux.Handle("POST /exercises/{id}/media", accounts.RequireAuth(http.HandlerFunc(h.uploadMedia)))
	mux.Handle("GET /exercises/{id}/image", accounts.RequireAuth(h.serveMedia(kindImage)))
	mux.Handle("GET /exercises/{id}/animated_demo", accounts.RequireAuth(h.serveMedia(kindAnimatedDemo)))
}

type handlers struct {
	queries *store.Queries
}

// likeEscaper makes a search term match literally inside an ILIKE pattern.
var likeEscaper = strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)

type listResponse struct {
	Exercises []Exercise `json:"exercises"`
}

func (h handlers) list(w http.ResponseWriter, r *http.Request) {
	caller, _ := auth.AccountID(r.Context())
	params := store.ListExercisesParams{CallerID: caller}
	if q := strings.TrimSpace(r.URL.Query().Get("q")); q != "" {
		params.NamePattern = new("%" + likeEscaper.Replace(q) + "%")
	}
	if v := r.URL.Query().Get("muscleGroup"); v != "" {
		if !slices.Contains(muscleGroups, v) {
			writeInvalidMuscleGroup(w)
			return
		}
		params.MuscleGroup = &v
	}
	if v := r.URL.Query().Get("equipmentType"); v != "" {
		if !slices.Contains(equipmentTypes, v) {
			writeInvalidEquipmentType(w)
			return
		}
		params.EquipmentType = &v
	}

	rows, err := h.queries.ListExercises(r.Context(), params)
	if err != nil {
		httpx.WriteInternalError(w, r, fmt.Errorf("list exercises: %w", err))
		return
	}

	out := make([]Exercise, len(rows))
	for i, row := range rows {
		out[i] = newExercise(store.GetVisibleExerciseRow(row))
	}
	httpx.WriteJSON(w, http.StatusOK, listResponse{Exercises: out})
}

func (h handlers) get(w http.ResponseWriter, r *http.Request) {
	row, ok := h.loadVisible(w, r)
	if !ok {
		return
	}
	httpx.WriteJSON(w, http.StatusOK, newExercise(row))
}

// loadVisible loads the {id} exercise if the caller may see it. Otherwise it
// writes a 404 and returns false; another user's custom exercise looks the
// same as one that doesn't exist.
func (h handlers) loadVisible(w http.ResponseWriter, r *http.Request) (store.GetVisibleExerciseRow, bool) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeNotFound(w)
		return store.GetVisibleExerciseRow{}, false
	}
	caller, _ := auth.AccountID(r.Context())
	row, err := h.queries.GetVisibleExercise(r.Context(), store.GetVisibleExerciseParams{ID: id, CallerID: caller})
	if errors.Is(err, pgx.ErrNoRows) {
		writeNotFound(w)
		return store.GetVisibleExerciseRow{}, false
	}
	if err != nil {
		httpx.WriteInternalError(w, r, fmt.Errorf("load exercise: %w", err))
		return store.GetVisibleExerciseRow{}, false
	}
	return row, true
}

func writeNotFound(w http.ResponseWriter) {
	httpx.WriteError(w, http.StatusNotFound, "exercise_not_found", "Exercise not found.")
}

type createBody struct {
	Name          string `json:"name"`
	MuscleGroup   string `json:"muscleGroup"`
	EquipmentType string `json:"equipmentType"`
}

const maxNameLength = 100

func (h handlers) create(w http.ResponseWriter, r *http.Request) {
	var body createBody
	if !httpx.DecodeJSON(w, r, &body) {
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" || utf8.RuneCountInString(name) > maxNameLength {
		httpx.WriteError(w, http.StatusBadRequest, "invalid_name",
			fmt.Sprintf("Name must be 1 to %d characters.", maxNameLength))
		return
	}
	if !slices.Contains(muscleGroups, body.MuscleGroup) {
		writeInvalidMuscleGroup(w)
		return
	}
	if !slices.Contains(equipmentTypes, body.EquipmentType) {
		writeInvalidEquipmentType(w)
		return
	}

	caller, _ := auth.AccountID(r.Context())
	row, err := h.queries.CreateCustomExercise(r.Context(), store.CreateCustomExerciseParams{
		Name:          name,
		MuscleGroup:   body.MuscleGroup,
		EquipmentType: body.EquipmentType,
		OwnerID:       caller,
	})
	if isForeignKeyViolation(err) {
		// The token is valid but its account is gone.
		auth.WriteUnauthorized(w)
		return
	}
	if err != nil {
		httpx.WriteInternalError(w, r, fmt.Errorf("create exercise: %w", err))
		return
	}
	// A new exercise has no media yet.
	httpx.WriteJSON(w, http.StatusCreated, newExercise(store.GetVisibleExerciseRow{
		ID:            row.ID,
		Name:          row.Name,
		MuscleGroup:   row.MuscleGroup,
		EquipmentType: row.EquipmentType,
		IsCustom:      row.IsCustom,
	}))
}

func isForeignKeyViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23503"
}
