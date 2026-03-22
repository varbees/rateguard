package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
	"unsafe"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"github.com/varbees/rateguard/internal/storage"
	"golang.org/x/crypto/bcrypt"
)

func newTestStore(t *testing.T) (*storage.PostgresStore, sqlmock.Sqlmock, func()) {
	t.Helper()

	db, mock, err := sqlmock.New(sqlmock.QueryMatcherOption(sqlmock.QueryMatcherRegexp))
	require.NoError(t, err)

	store := &storage.PostgresStore{}
	field := reflect.ValueOf(store).Elem().FieldByName("db")
	reflect.NewAt(field.Type(), unsafe.Pointer(field.UnsafeAddr())).Elem().Set(reflect.ValueOf(db))

	cleanup := func() {
		require.NoError(t, mock.ExpectationsWereMet())
	}

	return store, mock, cleanup
}

func TestAuthHandlerLoginAcceptsIdentifier(t *testing.T) {
	store, mock, cleanup := newTestStore(t)
	defer cleanup()

	password := "Password123!"
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	require.NoError(t, err)

	userID := uuid.New()
	now := time.Now().UTC()

	rows := sqlmock.NewRows([]string{
		"id", "email", "password_hash", "api_key", "handle", "plan", "active", "email_verified",
		"verification_token", "reset_token", "reset_token_expires", "country_code",
		"detected_currency", "last_login_at", "created_at", "updated_at",
	}).AddRow(
		userID,
		"jane.doe@example.com",
		string(hashedPassword),
		"rg_test_api_key",
		"jane-doe",
		"standard",
		true,
		true,
		nil,
		nil,
		nil,
		nil,
		nil,
		nil,
		now,
		now,
	)

	mock.ExpectQuery(`(?s).*FROM\s+users.*`).
		WithArgs(sqlmock.AnyArg()).
		WillReturnRows(rows)

	handler := NewAuthHandler(store, nil, "test-secret")
	app := fiber.New()
	app.Post("/api/v1/auth/login", handler.Login)

	body, err := json.Marshal(map[string]string{
		"identifier": "jane-doe",
		"password":   password,
	})
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	require.Equal(t, http.StatusOK, resp.StatusCode)

	var result struct {
		User struct {
			ID     string `json:"id"`
			Email  string `json:"email"`
			Handle string `json:"handle"`
		} `json:"user"`
		AccessToken string `json:"access_token"`
		APIKey      string `json:"api_key"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
	require.Equal(t, userID.String(), result.User.ID)
	require.Equal(t, "jane.doe@example.com", result.User.Email)
	require.Equal(t, "jane-doe", result.User.Handle)
	require.NotEmpty(t, result.AccessToken)
	require.Equal(t, "rg_test_api_key", result.APIKey)
}
