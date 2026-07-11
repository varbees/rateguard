package rateguard

import (
	"sync"
	"time"
)

const defaultEnforcementLogCapacity = 1000

// EnforcementEvent is one record of RateGuard intervening on an outbound call:
// a budget it stopped, a rate limit it hit, a freeze it enforced. It is the
// pull-side audit trail behind "where did the spend go, and when did
// enforcement fire" — queryable in-process (SDK.EnforcementEvents) and over the
// admin API (GET /admin/events), never requiring a webhook. It complements the
// push-side EventEmitter and the FOCUS cost export.
type EnforcementEvent struct {
	At       time.Time `json:"at"`
	Type     string    `json:"type"`               // token_budget_exceeded, rate_limited, frozen
	Customer string    `json:"customer,omitempty"` // when attributed via X-RateGuard-Customer
	Provider string    `json:"provider,omitempty"`
	Model    string    `json:"model,omitempty"`
	Detail   string    `json:"detail,omitempty"`
}

// enforcementLog is a bounded, lock-guarded ring buffer of the most recent
// enforcement events. Fixed memory: the oldest event is overwritten once full,
// so a long-running process never grows this unbounded.
type enforcementLog struct {
	mu    sync.Mutex
	clock Clock
	buf   []EnforcementEvent
	head  int   // next write index
	full  bool  // whether the ring has wrapped
	total int64 // lifetime count, never reset
}

func newEnforcementLog(clock Clock, capacity int) *enforcementLog {
	if capacity <= 0 {
		capacity = defaultEnforcementLogCapacity
	}
	if clock == nil {
		clock = systemClock{}
	}
	return &enforcementLog{clock: clock, buf: make([]EnforcementEvent, capacity)}
}

func (l *enforcementLog) record(e EnforcementEvent) {
	if e.At.IsZero() {
		e.At = l.clock.Now().UTC()
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	l.buf[l.head] = e
	l.head = (l.head + 1) % len(l.buf)
	if l.head == 0 {
		l.full = true
	}
	l.total++
}

// recent returns up to limit of the most recent events, newest first. limit <= 0
// returns every buffered event.
func (l *enforcementLog) recent(limit int) []EnforcementEvent {
	l.mu.Lock()
	defer l.mu.Unlock()
	n := len(l.buf)
	count := l.head
	if l.full {
		count = n
	}
	if limit <= 0 || limit > count {
		limit = count
	}
	out := make([]EnforcementEvent, 0, limit)
	for i := 0; i < limit; i++ {
		out = append(out, l.buf[(l.head-1-i+n)%n])
	}
	return out
}

func (l *enforcementLog) lifetimeTotal() int64 {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.total
}

// EnforcementEvents returns up to limit of the most recent enforcement events
// (budget stops, rate limits, freezes), newest first. limit <= 0 returns every
// buffered event. This is the pull-side audit trail — no webhook required —
// and feeds finance ("what did we block, and when") and the compliance record.
func (s *SDK) EnforcementEvents(limit int) []EnforcementEvent {
	return s.enforceLog.recent(limit)
}
