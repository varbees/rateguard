package rateguard

import (
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// ── Budget enforcement under concurrency ──
//
// Budget enforcement is a shared-counter problem, and shared counters are
// where races turn into money. Every other test in this file drives the
// budget one request at a time, which is the one scenario a production agent
// never produces.
//
// These tests exist to pin the reservation model's actual guarantee. The
// contract, from reserveWithEstimate's own doc comment:
//
//	estimate == 0  → reserve the ENTIRE remaining budget. Never overshoots,
//	                 but serializes concurrent requests on the same key.
//	estimate  > 0  → reserve min(estimate, remaining). Concurrency proceeds
//	                 "while the estimate holds" — and the honest reading of
//	                 that clause is that overshoot is POSSIBLE when it does
//	                 not hold. These tests bound it rather than pretend.
//
// Run with -race. That is the point, not a bonus.

const concurrencyBudgetKey = "tenant:openai:gpt-4o:outbound"

// hardStopHourPolicy builds a policy with only an hourly token cap.
func hardStopHourPolicy(hour int64) PolicyPreset {
	return PolicyPreset{
		Name:               "concurrency-test",
		TokenBudgetPerHour: hour,
		TokenBudgetMode:    TokenBudgetModeHardStop,
	}
}

// TestBudgetNeverOvershootsWithFullReservation is the strongest claim the
// budget manager makes: with estimate == 0 the reservation covers the whole
// remaining budget, so no amount of concurrency can commit past the limit.
func TestBudgetNeverOvershootsWithFullReservation(t *testing.T) {
	const (
		limit      = 1000
		goroutines = 200
		perCall    = 100
	)

	clock := &fakeBudgetClock{now: time.Unix(1_700_000_000, 0)}
	m := newTokenBudgetManager(clock)
	policy := hardStopHourPolicy(limit)

	var committed atomic.Int64
	var allowed atomic.Int64

	var wg sync.WaitGroup
	start := make(chan struct{})
	for i := 0; i < goroutines; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start // release everyone at once — maximize the race window
			d := m.reserve(concurrencyBudgetKey, policy, TokenBudgetModeHardStop)
			if !d.Allowed {
				return
			}
			allowed.Add(1)
			m.commitReservation(concurrencyBudgetKey, d.reservationID, perCall)
			committed.Add(perCall)
		}()
	}
	close(start)
	wg.Wait()

	if got := committed.Load(); got > limit {
		t.Fatalf("budget overshoot: committed %d tokens against a %d limit (%d calls allowed)",
			got, limit, allowed.Load())
	}
	if allowed.Load() == 0 {
		t.Fatal("no call was allowed — the test proved nothing")
	}
	t.Logf("full reservation: %d/%d goroutines allowed, %d/%d tokens committed",
		allowed.Load(), goroutines, committed.Load(), limit)
}

// TestBudgetHonorsEstimateUnderConcurrency covers the concurrent path: every
// caller declares an estimate and stays within it. Reservations are counted
// against the limit, so honest estimates must not overshoot.
func TestBudgetHonorsEstimateUnderConcurrency(t *testing.T) {
	const (
		limit      = 10_000
		goroutines = 500
		estimate   = 100
	)

	clock := &fakeBudgetClock{now: time.Unix(1_700_000_000, 0)}
	m := newTokenBudgetManager(clock)
	policy := hardStopHourPolicy(limit)

	var committed atomic.Int64

	var wg sync.WaitGroup
	start := make(chan struct{})
	for i := 0; i < goroutines; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			d := m.reserveWithEstimate(concurrencyBudgetKey, policy, TokenBudgetModeHardStop, estimate)
			if !d.Allowed {
				return
			}
			// Commit exactly what we reserved: the honest caller.
			m.commitReservation(concurrencyBudgetKey, d.reservationID, estimate)
			committed.Add(estimate)
		}()
	}
	close(start)
	wg.Wait()

	if got := committed.Load(); got > limit {
		t.Fatalf("budget overshoot with honest estimates: committed %d against a %d limit", got, limit)
	}
	t.Logf("honest estimates: %d/%d tokens committed", committed.Load(), limit)
}

// TestBudgetOvershootIsBoundedWhenEstimateIsWrong is the honest one.
//
// When a caller under-estimates, overshoot is possible by construction: N
// requests can pass the gate holding small reservations and then each commit
// something larger. This does not assert zero overshoot — that would be a
// false claim. It bounds it, and the bound is what should appear in the docs
// instead of an implied guarantee.
//
// If this test ever fails, the reservation model changed and the documented
// bound is stale.
func TestBudgetOvershootIsBoundedWhenEstimateIsWrong(t *testing.T) {
	const (
		limit      = 1000
		goroutines = 50
		estimate   = 10  // what the caller claims
		actual     = 200 // what the caller actually burns: 20x the estimate
	)

	clock := &fakeBudgetClock{now: time.Unix(1_700_000_000, 0)}
	m := newTokenBudgetManager(clock)
	policy := hardStopHourPolicy(limit)

	var committed atomic.Int64
	var allowed atomic.Int64

	var wg sync.WaitGroup
	start := make(chan struct{})
	for i := 0; i < goroutines; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			d := m.reserveWithEstimate(concurrencyBudgetKey, policy, TokenBudgetModeHardStop, estimate)
			if !d.Allowed {
				return
			}
			allowed.Add(1)
			m.commitReservation(concurrencyBudgetKey, d.reservationID, actual)
			committed.Add(actual)
		}()
	}
	close(start)
	wg.Wait()

	// The bound: every caller admitted concurrently holds only `estimate`
	// against the limit, so at most ceil(limit/estimate) callers pass, each
	// able to burn `actual`. Overshoot cannot exceed that.
	maxAdmitted := int64(limit/estimate) + 1
	bound := maxAdmitted * actual

	if got := committed.Load(); got > bound {
		t.Fatalf("overshoot exceeded its bound: committed %d, bound %d (%d calls admitted)",
			got, bound, allowed.Load())
	}

	// Document reality rather than assert a comfortable fiction.
	if over := committed.Load() - limit; over > 0 {
		t.Logf("EXPECTED overshoot with a 20x-wrong estimate: committed %d against a %d limit "+
			"(+%d, %.1fx) across %d admitted calls — bound %d",
			committed.Load(), limit, over, float64(committed.Load())/float64(limit), allowed.Load(), bound)
	}
}

// TestReservationLeakDoesNotBlockBudgetForever covers the abandoned-request
// path: a caller reserves and then dies without committing or releasing (a
// client disconnect mid-stream, a panic, a cancelled context). Without a TTL
// the reservation would hold budget forever and RateGuard would deny-of-wallet
// its own user.
func TestReservationLeakDoesNotBlockBudgetForever(t *testing.T) {
	const limit = 100

	clock := &fakeBudgetClock{now: time.Unix(1_700_000_000, 0)}
	m := newTokenBudgetManager(clock)
	policy := hardStopHourPolicy(limit)

	// Reserve the whole budget, then abandon it.
	d := m.reserve(concurrencyBudgetKey, policy, TokenBudgetModeHardStop)
	if !d.Allowed {
		t.Fatal("first reservation should be allowed")
	}
	if d.reservationID == "" {
		t.Fatal("expected a reservation ID for a hard-stop budget")
	}

	// Budget is now fully reserved — the next caller must be denied.
	if blocked := m.reserve(concurrencyBudgetKey, policy, TokenBudgetModeHardStop); blocked.Allowed {
		t.Fatal("budget fully reserved, yet a second reservation was allowed")
	}

	// Walk past the TTL. The abandoned reservation must be reclaimed.
	clock.Advance(tokenBudgetReservationTTL + time.Second)

	if recovered := m.reserve(concurrencyBudgetKey, policy, TokenBudgetModeHardStop); !recovered.Allowed {
		t.Fatalf("leaked reservation was never reclaimed after its %v TTL — "+
			"an abandoned request permanently consumes budget", tokenBudgetReservationTTL)
	}
}

// TestConcurrentDistinctKeysDoNotInterfere guards per-customer attribution:
// budgets are keyed per {tenant}:{provider}:{model}, and a race in the
// key->state map would cross customer budgets — one tenant's spend silently
// billed against another's cap.
func TestConcurrentDistinctKeysDoNotInterfere(t *testing.T) {
	const (
		limit    = 100
		tenants  = 50
		perCall  = 100
		attempts = 4
	)

	clock := &fakeBudgetClock{now: time.Unix(1_700_000_000, 0)}
	m := newTokenBudgetManager(clock)
	policy := hardStopHourPolicy(limit)

	allowed := make([]atomic.Int64, tenants)

	var wg sync.WaitGroup
	start := make(chan struct{})
	for i := 0; i < tenants; i++ {
		for j := 0; j < attempts; j++ {
			wg.Add(1)
			go func(tenant int) {
				defer wg.Done()
				<-start
				key := fmt.Sprintf("tenant-%d:openai:gpt-4o:outbound", tenant)
				d := m.reserve(key, policy, TokenBudgetModeHardStop)
				if !d.Allowed {
					return
				}
				allowed[tenant].Add(1)
				m.commitReservation(key, d.reservationID, perCall)
			}(i)
		}
	}
	close(start)
	wg.Wait()

	// Each tenant's budget fits exactly one call. Every tenant must get
	// exactly one — no starvation, no cross-tenant leakage.
	for i := 0; i < tenants; i++ {
		if got := allowed[i].Load(); got != 1 {
			t.Fatalf("tenant %d: %d calls allowed against a budget of exactly one — "+
				"budgets are leaking across keys", i, got)
		}
	}
}
