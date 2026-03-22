package api

import (
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/varbees/rateguard/internal/models"
)

func TestWriteProxyRequestErrorResponse(t *testing.T) {
	t.Parallel()

	app := fiber.New()
	app.Get("/rate-limit", func(c *fiber.Ctx) error {
		return writeProxyRequestErrorResponse(
			c,
			models.ErrRateLimitExceeded,
			&models.ProxyResponse{
				RequestID:  "req-1",
				StatusCode: http.StatusTooManyRequests,
				Error: &models.ProxyError{
					Code:    "RATE_LIMIT_EXCEEDED",
					Message: "Rate limit exceeded",
				},
				Timestamp: time.Now(),
			},
			"req-1",
			"user-1",
			"api-1",
			"Proxy request failed",
			"missing api",
			"disabled api",
		)
	})

	app.Get("/not-found", func(c *fiber.Ctx) error {
		return writeProxyRequestErrorResponse(
			c,
			models.ErrAPINotFound,
			nil,
			"req-2",
			"user-2",
			"api-2",
			"Proxy request failed",
			"missing api",
			"disabled api",
		)
	})

	app.Get("/disabled", func(c *fiber.Ctx) error {
		return writeProxyRequestErrorResponse(
			c,
			models.ErrAPIDisabled,
			nil,
			"req-3",
			"user-3",
			"api-3",
			"Proxy request failed",
			"missing api",
			"disabled api",
		)
	})

	app.Get("/generic", func(c *fiber.Ctx) error {
		return writeProxyRequestErrorResponse(
			c,
			errors.New("boom"),
			nil,
			"req-4",
			"user-4",
			"api-4",
			"Proxy request failed",
			"missing api",
			"disabled api",
		)
	})

	tests := []struct {
		path       string
		wantStatus int
		wantBody   string
	}{
		{path: "/rate-limit", wantStatus: http.StatusTooManyRequests, wantBody: "RATE_LIMIT_EXCEEDED"},
		{path: "/not-found", wantStatus: http.StatusNotFound, wantBody: "missing api"},
		{path: "/disabled", wantStatus: http.StatusForbidden, wantBody: "disabled api"},
		{path: "/generic", wantStatus: http.StatusBadGateway, wantBody: "Proxy failed"},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.path, func(t *testing.T) {
			t.Parallel()

			req := httptest.NewRequest(http.MethodGet, tt.path, nil)
			resp, err := app.Test(req)
			if err != nil {
				t.Fatalf("app.Test error = %v", err)
			}
			defer resp.Body.Close()

			body, err := io.ReadAll(resp.Body)
			if err != nil {
				t.Fatalf("read body error = %v", err)
			}

			if resp.StatusCode != tt.wantStatus {
				t.Fatalf("status = %d, want %d", resp.StatusCode, tt.wantStatus)
			}
			if !strings.Contains(string(body), tt.wantBody) {
				t.Fatalf("body = %q, want to contain %q", string(body), tt.wantBody)
			}
		})
	}
}
