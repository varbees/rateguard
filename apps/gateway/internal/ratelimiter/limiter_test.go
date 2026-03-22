package ratelimiter

import (
	"context"
	"testing"
	"time"
)

func TestRateLimiterCreation(t *testing.T) {
	rl := New(10, 20, true)
	if rl == nil {
		t.Fatal("Expected rate limiter to be created")
	}

	if !rl.IsEnabled() {
		t.Error("Expected rate limiter to be enabled")
	}

	if rl.GetRate() != 10 {
		t.Errorf("Expected rate 10, got %f", rl.GetRate())
	}

	if rl.GetBurst() != 20 {
		t.Errorf("Expected burst 20, got %d", rl.GetBurst())
	}
}

func TestRateLimiterDisabled(t *testing.T) {
	rl := New(10, 20, false)

	// Should allow immediately when disabled
	if !rl.Allow() {
		t.Error("Expected Allow() to return true when disabled")
	}

	// Wait should not block when disabled
	ctx := context.Background()
	err := rl.Wait(ctx)
	if err != nil {
		t.Errorf("Expected no error from Wait when disabled, got: %v", err)
	}
}

func TestRateLimiterAllow(t *testing.T) {
	rl := New(5, 5, true)

	// Should allow up to burst size immediately
	allowed := 0
	for i := 0; i < 10; i++ {
		if rl.Allow() {
			allowed++
		}
	}

	if allowed < 5 {
		t.Errorf("Expected at least 5 allows, got %d", allowed)
	}

	if allowed > 5 {
		t.Errorf("Expected at most 5 allows due to burst, got %d", allowed)
	}
}

func TestRateLimiterWait(t *testing.T) {
	rl := New(10, 1, true)
	ctx := context.Background()

	// First wait should succeed immediately
	start := time.Now()
	err := rl.Wait(ctx)
	if err != nil {
		t.Fatalf("First wait failed: %v", err)
	}
	duration := time.Since(start)

	if duration > 10*time.Millisecond {
		t.Errorf("First wait took too long: %v", duration)
	}

	// Second wait should block
	start = time.Now()
	err = rl.Wait(ctx)
	if err != nil {
		t.Fatalf("Second wait failed: %v", err)
	}
	duration = time.Since(start)

	// Should wait approximately 100ms (1/10 second for rate of 10)
	if duration < 50*time.Millisecond {
		t.Errorf("Second wait was too fast: %v", duration)
	}
}

func TestRateLimiterContextCancellation(t *testing.T) {
	rl := New(1, 1, true)

	// Exhaust the limiter
	ctx := context.Background()
	_ = rl.Wait(ctx)

	// Create cancelled context
	cancelledCtx, cancel := context.WithCancel(context.Background())
	cancel()

	// Should return context error
	err := rl.Wait(cancelledCtx)
	if err == nil {
		t.Error("Expected error from cancelled context")
	}
}

func TestRateLimiterSetRate(t *testing.T) {
	rl := New(10, 10, true)

	rl.SetRate(20)
	if rl.GetRate() != 20 {
		t.Errorf("Expected rate 20 after SetRate, got %f", rl.GetRate())
	}
}

func TestRateLimiterSetBurst(t *testing.T) {
	rl := New(10, 10, true)

	rl.SetBurst(30)
	if rl.GetBurst() != 30 {
		t.Errorf("Expected burst 30 after SetBurst, got %d", rl.GetBurst())
	}
}

func TestRateLimiterEnableDisable(t *testing.T) {
	rl := New(10, 10, true)

	if !rl.IsEnabled() {
		t.Error("Expected rate limiter to be enabled initially")
	}

	rl.Disable()
	if rl.IsEnabled() {
		t.Error("Expected rate limiter to be disabled after Disable()")
	}

	rl.Enable()
	if !rl.IsEnabled() {
		t.Error("Expected rate limiter to be enabled after Enable()")
	}
}

func TestRateLimiterWaitN(t *testing.T) {
	rl := New(10, 10, true)
	ctx := context.Background()

	// Request 5 tokens
	err := rl.WaitN(ctx, 5)
	if err != nil {
		t.Fatalf("WaitN failed: %v", err)
	}

	// Only 5 tokens should remain
	allowed := 0
	for i := 0; i < 10; i++ {
		if rl.Allow() {
			allowed++
		}
	}

	if allowed > 5 {
		t.Errorf("Expected at most 5 tokens remaining, got %d", allowed)
	}
}
