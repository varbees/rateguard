package api

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"github.com/varbees/rateguard/internal/models"
)

func TestDashboardHandlerCreateAPIConfigDerivesSlug(t *testing.T) {
	store, mock, cleanup := newTestStore(t)
	defer cleanup()

	userID := uuid.New()
	now := time.Now().UTC()

	insertRows := sqlmock.NewRows([]string{"id", "created_at", "updated_at"}).
		AddRow(uuid.New(), now, now)

	mock.ExpectQuery(`(?s).*`).
		WillReturnRows(insertRows)

	handler := &DashboardHandler{
		store: store,
	}
	app := fiber.New()
	app.Post("/api/v1/apis", func(c *fiber.Ctx) error {
		c.Locals("user", &models.User{ID: userID})
		return handler.CreateAPIConfig(c)
	})

	body, err := json.Marshal(map[string]any{
		"name":                 "My GitHub API",
		"target_url":           "https://api.example.com/v1",
		"rate_limit_per_second": 10,
		"burst_size":           20,
		"auth_type":            "none",
		"timeout_seconds":      30,
		"retry_attempts":       3,
	})
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/apis", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		bodyBytes, _ := io.ReadAll(resp.Body)
		t.Fatalf("unexpected status %d: %s", resp.StatusCode, string(bodyBytes))
	}

	require.Equal(t, http.StatusCreated, resp.StatusCode)

	var result struct {
		ID   string `json:"id"`
		Name string `json:"name"`
		Slug string `json:"slug"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
	require.NotEmpty(t, result.ID)
	require.Equal(t, "my-github-api", result.Name)
	require.Equal(t, "my-github-api", result.Slug)
}
