// Package auth owns accounts: sign-up, login and bearer-token issuance. Other
// modules use RequireAuth and AccountID to identify the caller, and never
// read the accounts table directly.
package auth

import (
	"context"
	"errors"
	"fmt"
	"net/mail"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"github.com/KolesnikovP/fitness_app/backend/internal/auth/store"
)

const (
	minPasswordLength = 8
	maxPasswordBytes  = 72 // bcrypt ignores anything past 72 bytes
)

var (
	ErrInvalidEmail       = errors.New("invalid email")
	ErrInvalidPassword    = errors.New("invalid password")
	ErrEmailTaken         = errors.New("email already registered")
	ErrInvalidCredentials = errors.New("invalid email or password")
	ErrAccountNotFound    = errors.New("account not found")
)

// ProfileCreator creates the profile that belongs to a new account, inside
// the sign-up transaction. The user module implements it, so auth never
// writes to the profiles table itself.
type ProfileCreator interface {
	CreateProfile(ctx context.Context, tx pgx.Tx, accountID uuid.UUID) error
}

type Account struct {
	ID    uuid.UUID `json:"id"`
	Email string    `json:"email"`
}

type Service struct {
	pool     *pgxpool.Pool
	queries  *store.Queries
	tokens   *Tokens
	profiles ProfileCreator
}

func NewService(pool *pgxpool.Pool, tokens *Tokens, profiles ProfileCreator) *Service {
	return &Service{pool: pool, queries: store.New(pool), tokens: tokens, profiles: profiles}
}

// dummyHash is compared against when the email is unknown, so a failed login
// takes about as long whether or not the account exists.
var dummyHash, _ = bcrypt.GenerateFromPassword([]byte("dummy-password"), bcrypt.DefaultCost)

// SignUp creates an account and its profile, and returns a token for it.
func (s *Service) SignUp(ctx context.Context, email, password string) (Account, string, error) {
	email, err := normaliseEmail(email)
	if err != nil {
		return Account{}, "", err
	}
	if len(password) < minPasswordLength || len(password) > maxPasswordBytes {
		return Account{}, "", ErrInvalidPassword
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return Account{}, "", fmt.Errorf("hash password: %w", err)
	}

	var account Account
	err = pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		row, err := s.queries.WithTx(tx).CreateAccount(ctx, store.CreateAccountParams{
			Email:        email,
			PasswordHash: string(hash),
		})
		if err != nil {
			return err
		}
		account = Account{ID: row.ID, Email: row.Email}
		return s.profiles.CreateProfile(ctx, tx, row.ID)
	})
	if isUniqueViolation(err) {
		return Account{}, "", ErrEmailTaken
	}
	if err != nil {
		return Account{}, "", fmt.Errorf("create account: %w", err)
	}

	token, err := s.tokens.Issue(account.ID)
	if err != nil {
		return Account{}, "", err
	}
	return account, token, nil
}

// LogIn checks the credentials and returns a fresh token. A wrong password and
// an unknown email both return ErrInvalidCredentials.
func (s *Service) LogIn(ctx context.Context, email, password string) (Account, string, error) {
	row, err := s.queries.GetAccountByEmail(ctx, strings.TrimSpace(email))
	if errors.Is(err, pgx.ErrNoRows) {
		_ = bcrypt.CompareHashAndPassword(dummyHash, []byte(password))
		return Account{}, "", ErrInvalidCredentials
	}
	if err != nil {
		return Account{}, "", fmt.Errorf("look up account: %w", err)
	}

	if bcrypt.CompareHashAndPassword([]byte(row.PasswordHash), []byte(password)) != nil {
		return Account{}, "", ErrInvalidCredentials
	}

	token, err := s.tokens.Issue(row.ID)
	if err != nil {
		return Account{}, "", err
	}
	return Account{ID: row.ID, Email: row.Email}, token, nil
}

// AccountByID lets other modules show account details without reading the
// accounts table.
func (s *Service) AccountByID(ctx context.Context, id uuid.UUID) (Account, error) {
	row, err := s.queries.GetAccountByID(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return Account{}, ErrAccountNotFound
	}
	if err != nil {
		return Account{}, fmt.Errorf("look up account: %w", err)
	}
	return Account{ID: row.ID, Email: row.Email}, nil
}

func normaliseEmail(raw string) (string, error) {
	email := strings.TrimSpace(raw)
	addr, err := mail.ParseAddress(email)
	// ParseAddress also accepts "Name <a@b.c>"; only a bare address is allowed.
	if err != nil || addr.Address != email {
		return "", ErrInvalidEmail
	}
	return email, nil
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
