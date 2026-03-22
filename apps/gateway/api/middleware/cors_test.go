package middleware

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
)

func TestSetCORSHeadersExposesPresetHeaders(t *testing.T) {
	t.Parallel()

	mw := &CORSMiddleware{}
	app := fiber.New()
	app.Get("/", func(c *fiber.Ctx) error {
		mw.setCORSHeaders(c, "https://app.example")
		return c.SendStatus(fiber.StatusNoContent)
	})

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Origin", "https://app.example")
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("app.Test error = %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("status = %d, want %d", resp.StatusCode, http.StatusNoContent)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read body error = %v", err)
	}
	if len(body) != 0 {
		t.Fatalf("response body = %q, want empty", string(body))
	}

	exposed := resp.Header.Get("Access-Control-Expose-Headers")
	for _, want := range []string{
		"X-RateGuard-Preset",
		"X-RateGuard-Request-ID",
	} {
		if !strings.Contains(exposed, want) {
			t.Fatalf("exposed headers = %q, missing %q", exposed, want)
		}
	}
}
