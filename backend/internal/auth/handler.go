package auth

import (
	"errors"
	"net/http"

	"github.com/KolesnikovP/fitness_app/backend/internal/platform/httpx"
)

type credentials struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type sessionResponse struct {
	Token   string  `json:"token"`
	Account Account `json:"account"`
}

func (s *Service) Routes(mux *http.ServeMux) {
	mux.HandleFunc("POST /auth/signup", s.handleSignUp)
	mux.HandleFunc("POST /auth/login", s.handleLogIn)
}

func (s *Service) handleSignUp(w http.ResponseWriter, r *http.Request) {
	var body credentials
	if !httpx.DecodeJSON(w, r, &body) {
		return
	}

	account, token, err := s.SignUp(r.Context(), body.Email, body.Password)
	switch {
	case errors.Is(err, ErrInvalidEmail):
		httpx.WriteError(w, http.StatusBadRequest, "invalid_email", "Enter a valid email address.")
	case errors.Is(err, ErrInvalidPassword):
		httpx.WriteError(w, http.StatusBadRequest, "invalid_password", "Password must be 8 to 72 characters.")
	case errors.Is(err, ErrEmailTaken):
		httpx.WriteError(w, http.StatusConflict, "email_taken", "An account with this email already exists.")
	case err != nil:
		httpx.WriteInternalError(w, r, err)
	default:
		httpx.WriteJSON(w, http.StatusCreated, sessionResponse{Token: token, Account: account})
	}
}

func (s *Service) handleLogIn(w http.ResponseWriter, r *http.Request) {
	var body credentials
	if !httpx.DecodeJSON(w, r, &body) {
		return
	}

	account, token, err := s.LogIn(r.Context(), body.Email, body.Password)
	switch {
	case errors.Is(err, ErrInvalidCredentials):
		httpx.WriteError(w, http.StatusUnauthorized, "invalid_credentials", "Email or password is incorrect.")
	case err != nil:
		httpx.WriteInternalError(w, r, err)
	default:
		httpx.WriteJSON(w, http.StatusOK, sessionResponse{Token: token, Account: account})
	}
}
