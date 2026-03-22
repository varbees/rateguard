package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	rateguard "github.com/varbees/rateguard/sdk-go"
)

func main() {
	sdk := rateguard.New(rateguard.Config{
		Preset:              envString("RATEGUARD_PRESET", "standard"),
		TenantID:            envString("RATEGUARD_TENANT_ID", "demo"),
		RouteID:             envString("RATEGUARD_ROUTE_ID", "hello"),
		UpstreamID:          envString("RATEGUARD_UPSTREAM_ID", "hello-service"),
		Provider:            envString("RATEGUARD_PROVIDER", "openai"),
		Model:               envString("RATEGUARD_MODEL", "gpt-4.1-mini"),
		RequestsPerSecond:   envInt("RATEGUARD_REQUESTS_PER_SECOND", 5),
		Burst:               envInt("RATEGUARD_BURST", 10),
		TokenBudgetMode:     rateguard.TokenBudgetModeHardStop,
		TokenBudgetPerHour:  envInt64("RATEGUARD_TOKEN_BUDGET_PER_HOUR", 2000),
		TokenBudgetPerDay:   envInt64("RATEGUARD_TOKEN_BUDGET_PER_DAY", 0),
		TokenBudgetPerMonth: envInt64("RATEGUARD_TOKEN_BUDGET_PER_MONTH", 0),
		EventEndpoint:       os.Getenv("RATEGUARD_EVENT_ENDPOINT"),
	})

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	})
	mux.HandleFunc("GET /hello", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(fmt.Sprintf(`{"message":"hello from RateGuard","preset":"%s","method":"%s"}`, sdk.Policy().Name, r.Method)))
	})

	addr := envString("ADDR", ":8080")
	server := &http.Server{
		Addr:              addr,
		Handler:           sdk.HTTPMiddleware(mux),
		ReadHeaderTimeout: 5 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		log.Printf("RateGuard demo listening on %s", addr)
		log.Printf("Preset=%s RequestsPerSecond=%d Burst=%d", sdk.Policy().Name, sdk.Policy().RequestsPerSecond, sdk.Policy().Burst)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen and serve: %v", err)
		}
	}()

	<-ctx.Done()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Printf("server shutdown error: %v", err)
	}
	if err := sdk.Shutdown(shutdownCtx); err != nil {
		log.Printf("sdk shutdown error: %v", err)
	}
}

func envString(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if parsed, err := strconv.Atoi(v); err == nil {
			return parsed
		}
	}
	return fallback
}

func envInt64(key string, fallback int64) int64 {
	if v := os.Getenv(key); v != "" {
		if parsed, err := strconv.ParseInt(v, 10, 64); err == nil {
			return parsed
		}
	}
	return fallback
}
