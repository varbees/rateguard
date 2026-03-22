package rateguard

import (
	"context"
	"sync"
	"time"
)

const defaultTokenBudgetCacheCapacity = 50000

// BudgetWaiter waits for a token budget to become available.
type BudgetWaiter interface {
	Wait(ctx context.Context, delay time.Duration) error
}

type systemBudgetWaiter struct{}

func (systemBudgetWaiter) Wait(ctx context.Context, delay time.Duration) error {
	if delay <= 0 {
		return nil
	}

	timer := time.NewTimer(delay)
	defer timer.Stop()

	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

type tokenBudgetDecision struct {
	Allowed    bool
	Applied    bool
	Queued     bool
	Remaining  int64
	RetryAfter time.Duration
	Limit      int64
	Window     string
}

type tokenBudgetRecord struct {
	occurredAt time.Time
	tokens     int64
}

type tokenBudgetState struct {
	records []tokenBudgetRecord
}

type tokenBudgetManager struct {
	mu     sync.Mutex
	clock  Clock
	states *boundedCache[string, *tokenBudgetState]
}

func newTokenBudgetManager(clock Clock) *tokenBudgetManager {
	return newTokenBudgetManagerWithCapacity(clock, defaultTokenBudgetCacheCapacity)
}

func newTokenBudgetManagerWithCapacity(clock Clock, capacity int) *tokenBudgetManager {
	if clock == nil {
		clock = systemClock{}
	}

	return &tokenBudgetManager{
		clock:  clock,
		states: newBoundedCache[string, *tokenBudgetState](capacity),
	}
}

func (m *tokenBudgetManager) waitForAvailability(ctx context.Context, key string, policy PolicyPreset, waiter BudgetWaiter, mode TokenBudgetMode) (tokenBudgetDecision, error) {
	if waiter == nil {
		waiter = systemBudgetWaiter{}
	}

	if mode == "" {
		mode = TokenBudgetModeHardStop
	}

	var queued bool
	var totalWait time.Duration
	for {
		decision := m.check(key, policy)
		if !decision.Applied || decision.Allowed || mode != TokenBudgetModeSoftStop {
			decision.Queued = queued
			if queued && totalWait > 0 {
				decision.RetryAfter = totalWait
			}
			return decision, nil
		}

		queued = true
		totalWait += decision.RetryAfter
		if err := waiter.Wait(ctx, decision.RetryAfter); err != nil {
			decision.Queued = true
			if totalWait > 0 {
				decision.RetryAfter = totalWait
			}
			return decision, err
		}
	}
}

func (m *tokenBudgetManager) record(key string, tokens int64) {
	if tokens <= 0 {
		return
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	if m.states == nil {
		m.states = newBoundedCache[string, *tokenBudgetState](defaultTokenBudgetCacheCapacity)
	}

	now := m.clock.Now()
	state := m.states.getOrCreate(key, func() *tokenBudgetState {
		return &tokenBudgetState{}
	})
	state.records = append(state.records, tokenBudgetRecord{
		occurredAt: now,
		tokens:     tokens,
	})
}

func (m *tokenBudgetManager) check(key string, policy PolicyPreset) tokenBudgetDecision {
	limits := tokenBudgetLimitsFromPolicy(policy)
	if !limits.enabled() {
		return tokenBudgetDecision{Allowed: true, Applied: false, Remaining: -1, Limit: -1}
	}

	now := m.clock.Now()

	m.mu.Lock()
	defer m.mu.Unlock()

	if m.states == nil {
		m.states = newBoundedCache[string, *tokenBudgetState](defaultTokenBudgetCacheCapacity)
	}

	state := m.states.getOrCreate(key, func() *tokenBudgetState {
		return &tokenBudgetState{}
	})
	state.records = pruneTokenBudgetRecords(state.records, now, limits.maxWindow())
	records := state.records

	usedHour := sumTokenBudget(records, now, time.Hour, limits.Hour)
	usedDay := sumTokenBudget(records, now, 24*time.Hour, limits.Day)
	usedMonth := sumTokenBudget(records, now, 30*24*time.Hour, limits.Month)

	decision := tokenBudgetDecision{
		Allowed:   true,
		Applied:   true,
		Remaining: -1,
		Limit:     -1,
	}

	if limits.Hour > 0 {
		decision.Limit = limits.Hour
		if usedHour >= limits.Hour {
			decision.Allowed = false
			decision.RetryAfter = maxDuration(decision.RetryAfter, retryAfterTokenBudget(records, now, time.Hour, limits.Hour))
			decision.Window = "hour"
			decision.Remaining = 0
		}
	}

	if limits.Day > 0 {
		if decision.Limit < 0 || limits.Day < decision.Limit {
			decision.Limit = limits.Day
		}
		if usedDay >= limits.Day {
			decision.Allowed = false
			decision.RetryAfter = maxDuration(decision.RetryAfter, retryAfterTokenBudget(records, now, 24*time.Hour, limits.Day))
			decision.Window = "day"
			decision.Remaining = 0
		}
	}

	if limits.Month > 0 {
		if decision.Limit < 0 || limits.Month < decision.Limit {
			decision.Limit = limits.Month
		}
		if usedMonth >= limits.Month {
			decision.Allowed = false
			decision.RetryAfter = maxDuration(decision.RetryAfter, retryAfterTokenBudget(records, now, 30*24*time.Hour, limits.Month))
			decision.Window = "month"
			decision.Remaining = 0
		}
	}

	if decision.Allowed {
		decision.Remaining = min64Positive(remainingAcrossWindows(usedHour, limits.Hour, usedDay, limits.Day, usedMonth, limits.Month))
		if decision.Limit < 0 {
			decision.Limit = 0
		}
	}

	return decision
}

type tokenBudgetLimits struct {
	Hour  int64
	Day   int64
	Month int64
	Mode  TokenBudgetMode
}

func tokenBudgetLimitsFromPolicy(policy PolicyPreset) tokenBudgetLimits {
	mode := TokenBudgetMode(policy.TokenBudgetMode)
	if mode == "" {
		mode = TokenBudgetModeHardStop
	}

	return tokenBudgetLimits{
		Hour:  policy.TokenBudgetPerHour,
		Day:   policy.TokenBudgetPerDay,
		Month: policy.TokenBudgetPerMonth,
		Mode:  mode,
	}
}

func (l tokenBudgetLimits) enabled() bool {
	return l.Hour > 0 || l.Day > 0 || l.Month > 0
}

func (l tokenBudgetLimits) maxWindow() time.Duration {
	switch {
	case l.Month > 0:
		return 30 * 24 * time.Hour
	case l.Day > 0:
		return 24 * time.Hour
	case l.Hour > 0:
		return time.Hour
	default:
		return 0
	}
}

func pruneTokenBudgetRecords(records []tokenBudgetRecord, now time.Time, maxWindow time.Duration) []tokenBudgetRecord {
	if maxWindow <= 0 {
		return nil
	}

	cutoff := now.Add(-maxWindow)
	index := 0
	for index < len(records) && !records[index].occurredAt.After(cutoff) {
		index++
	}
	if index == 0 {
		return records
	}
	if index >= len(records) {
		return nil
	}

	pruned := make([]tokenBudgetRecord, len(records)-index)
	copy(pruned, records[index:])
	return pruned
}

func sumTokenBudget(records []tokenBudgetRecord, now time.Time, window time.Duration, limit int64) int64 {
	if limit <= 0 {
		return 0
	}

	cutoff := now.Add(-window)
	var total int64
	for _, record := range records {
		if !record.occurredAt.After(cutoff) {
			continue
		}
		total += record.tokens
	}
	return total
}

func retryAfterTokenBudget(records []tokenBudgetRecord, now time.Time, window time.Duration, limit int64) time.Duration {
	if limit <= 0 {
		return 0
	}

	used := sumTokenBudget(records, now, window, limit)
	if used < limit {
		return 0
	}

	needToExpire := used - limit + 1
	var removed int64
	for _, record := range records {
		if !record.occurredAt.After(now.Add(-window)) {
			continue
		}

		removed += record.tokens
		expiry := record.occurredAt.Add(window)
		if removed >= needToExpire {
			if delta := expiry.Sub(now); delta > 0 {
				return delta
			}
			return 0
		}
	}

	return 0
}

func remainingAcrossWindows(usedHour, limitHour, usedDay, limitDay, usedMonth, limitMonth int64) int64 {
	remaining := int64(-1)

	if limitHour > 0 {
		remaining = limitHour - usedHour
	}
	if limitDay > 0 {
		value := limitDay - usedDay
		if remaining < 0 || value < remaining {
			remaining = value
		}
	}
	if limitMonth > 0 {
		value := limitMonth - usedMonth
		if remaining < 0 || value < remaining {
			remaining = value
		}
	}

	if remaining < 0 {
		return 0
	}
	return remaining
}

func maxDuration(a, b time.Duration) time.Duration {
	if b > a {
		return b
	}
	return a
}

func min64Positive(v int64) int64 {
	if v < 0 {
		return 0
	}
	return v
}
