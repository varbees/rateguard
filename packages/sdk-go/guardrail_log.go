package rateguard

import (
	"sync"
	"time"
)

const guardrailLogCapacity = 50

// GuardrailEvent is a recorded violation: code, message, and when it
// happened. Deliberately excludes the request body/content that triggered
// it — the log exists for operator visibility, not to store the PII or
// injection payload it just caught.
type GuardrailEvent struct {
	Code    string    `json:"code"`
	Message string    `json:"message"`
	At      time.Time `json:"at"`
}

// guardrailLog is a small bounded ring buffer of recent violations plus
// cumulative counts by code, guarded by a mutex (violations are rare
// relative to the request hot path, so a mutex is simpler than atomics
// here and the contention cost is negligible).
type guardrailLog struct {
	mu     sync.Mutex
	recent []GuardrailEvent
	counts map[string]int64
	total  int64
}

func newGuardrailLog() *guardrailLog {
	return &guardrailLog{counts: make(map[string]int64)}
}

func (g *guardrailLog) record(v *GuardrailViolation) {
	if g == nil || v == nil {
		return
	}
	g.mu.Lock()
	defer g.mu.Unlock()

	g.total++
	g.counts[v.Code]++
	g.recent = append(g.recent, GuardrailEvent{Code: v.Code, Message: v.Message, At: time.Now().UTC()})
	if len(g.recent) > guardrailLogCapacity {
		g.recent = g.recent[len(g.recent)-guardrailLogCapacity:]
	}
}

// Stats mirrors LoopDetector.Stats()'s shape convention — a plain map ready
// to serialize into the admin API / list_limits response.
func (g *guardrailLog) Stats() map[string]any {
	if g == nil {
		return map[string]any{"enabled": false}
	}
	g.mu.Lock()
	defer g.mu.Unlock()

	byCode := make(map[string]int64, len(g.counts))
	for code, n := range g.counts {
		byCode[code] = n
	}
	recent := make([]GuardrailEvent, len(g.recent))
	copy(recent, g.recent)

	return map[string]any{
		"enabled": true,
		"total":   g.total,
		"by_code": byCode,
		"recent":  recent,
	}
}
