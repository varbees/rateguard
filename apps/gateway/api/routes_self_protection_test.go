package api

import (
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/adaptor"
	"github.com/varbees/rateguard/api/middleware"
)

func TestSetupRoutesAppliesSelfProtectionOnlyToAPIV1(t *testing.T) {
	t.Parallel()

	app := fiber.New()

	var protectedHits int32
	selfProtection := adaptor.HTTPMiddleware(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			atomic.AddInt32(&protectedHits, 1)
			w.WriteHeader(http.StatusTooManyRequests)
		})
	})

	SetupRoutes(
		app,
		&Handler{},
		&ProxyHandler{},
		&DashboardHandler{},
		&AuthHandler{},
		&SettingsHandler{},
		&APIKeysHandler{},
		&QueueHandler{},
		&RateLimitSuggestionHandler{},
		&GuardrailHandler{},
		middleware.NewAuthMiddleware(nil, ""),
		middleware.NewIdempotencyMiddleware(nil),
		middleware.NewMeteringMiddleware(nil),
		nil,
		middleware.NewCORSMiddleware(nil, nil),
		middleware.NewGlobalRateLimitMiddleware(nil),
		selfProtection,
		&HealthHandler{},
		nil,
		&WebSocketHandler{},
		&MetricsHandler{},
	)

	healthReq := httptest.NewRequest(http.MethodGet, "/health", nil)
	healthRes, err := app.Test(healthReq)
	if err != nil {
		t.Fatalf("health request failed: %v", err)
	}
	if healthRes.StatusCode != http.StatusOK {
		t.Fatalf("health status = %d, want %d", healthRes.StatusCode, http.StatusOK)
	}

	apiReq := httptest.NewRequest(http.MethodGet, "/api/v1/openapi.json", nil)
	apiRes, err := app.Test(apiReq)
	if err != nil {
		t.Fatalf("api request failed: %v", err)
	}
	if apiRes.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("api status = %d, want %d", apiRes.StatusCode, http.StatusTooManyRequests)
	}

	if got := atomic.LoadInt32(&protectedHits); got != 1 {
		t.Fatalf("protected middleware hits = %d, want 1", got)
	}
}
