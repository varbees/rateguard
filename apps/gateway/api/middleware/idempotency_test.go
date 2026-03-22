package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
)

func TestIdempotencyMiddlewareRequiresKey(t *testing.T) {
	t.Parallel()

	app := fiber.New()
	mw := NewIdempotencyMiddleware(nil)

	app.Post("/apis", func(c *fiber.Ctx) error {
		return mw.Enforce(c)
	}, func(c *fiber.Ctx) error {
		return c.SendStatus(http.StatusCreated)
	})

	req := httptest.NewRequest(http.MethodPost, "/apis", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app test error: %v", err)
	}
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", resp.StatusCode, http.StatusBadRequest)
	}
}

func TestIdempotencyMiddlewareBlocksDuplicates(t *testing.T) {
	t.Parallel()

	app := fiber.New()
	mw := NewIdempotencyMiddleware(nil)

	app.Post("/apis", func(c *fiber.Ctx) error {
		return mw.Enforce(c)
	}, func(c *fiber.Ctx) error {
		return c.SendStatus(http.StatusCreated)
	})

	first := httptest.NewRequest(http.MethodPost, "/apis", nil)
	first.Header.Set("Idempotency-Key", "demo-key")
	resp, err := app.Test(first)
	if err != nil {
		t.Fatalf("first request error: %v", err)
	}
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("first status = %d, want %d", resp.StatusCode, http.StatusCreated)
	}

	second := httptest.NewRequest(http.MethodPost, "/apis", nil)
	second.Header.Set("Idempotency-Key", "demo-key")
	resp, err = app.Test(second)
	if err != nil {
		t.Fatalf("second request error: %v", err)
	}
	if resp.StatusCode != http.StatusConflict {
		t.Fatalf("second status = %d, want %d", resp.StatusCode, http.StatusConflict)
	}
}
