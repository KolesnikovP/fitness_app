// Package httpx holds the JSON request and response helpers shared by every
// module's handlers.
package httpx

import (
	"encoding/json"
	"log/slog"
	"net/http"
)

const maxBodyBytes = 1 << 20

type errorBody struct {
	Error errorDetail `json:"error"`
}

type errorDetail struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func WriteJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		slog.Error("encode response", "err", err)
	}
}

// WriteError writes the API's single error shape:
// {"error": {"code": "...", "message": "..."}}.
func WriteError(w http.ResponseWriter, status int, code, message string) {
	WriteJSON(w, status, errorBody{Error: errorDetail{Code: code, Message: message}})
}

// WriteInternalError logs err and returns a generic 500 so internal details
// never reach the client.
func WriteInternalError(w http.ResponseWriter, r *http.Request, err error) {
	slog.Error("internal error", "method", r.Method, "path", r.URL.Path, "err", err)
	WriteError(w, http.StatusInternalServerError, "internal", "Something went wrong.")
}

// DecodeJSON reads a JSON body into dst. On failure it writes a 400 response
// and returns false, so handlers can simply return.
func DecodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBodyBytes))
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid_json", "Request body must be valid JSON.")
		return false
	}
	if dec.More() {
		WriteError(w, http.StatusBadRequest, "invalid_json", "Request body must contain a single JSON object.")
		return false
	}
	return true
}
