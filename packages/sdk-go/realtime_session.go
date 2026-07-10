package rateguard

import (
	"sync"
	"time"
)

// ── Realtime session guard — budgets for sessions, not requests ──
//
// A voice session is one WebSocket that can burn dollars per minute for
// hours. RealtimeSessionGuard accumulates the usage events extracted by
// realtime_usage.go and answers, on every observation: is this session
// still within budget?
//
// Enforcement stance (the plan's "never rewrite frames" rule): the guard
// DECIDES, the integrator ACTS. On the first limit breach it fires
// OnExceeded exactly once and every subsequent decision keeps reporting
// Exceeded — the integrator closes the socket with a proper close frame,
// degrades to text, or downgrades the model. The guard never injects or
// alters traffic, and observing more events after a breach never
// un-breaches (terminal by design: a session that outspent its budget
// does not heal).
//
// Cost is OPTIONAL and caller-priced: realtime audio pricing changes too
// often to bake in. Supply RealtimeCostRates (micro-USD per MILLION
// tokens per class) to get cost accounting and cost limits; leave it zero
// and cost stays zero. Estimates, never invoice truth.

// RealtimeCostRates prices token classes in micro-USD per million tokens
// (e.g. $32/M audio-input = 32_000_000).
type RealtimeCostRates struct {
	InputTextPerMTokens   int64
	InputAudioPerMTokens  int64
	InputCachedPerMTokens int64
	OutputTextPerMTokens  int64
	OutputAudioPerMTokens int64
}

func (r RealtimeCostRates) costMicroUSD(u RealtimeUsage) int64 {
	// Cached input is priced by its own rate; the un-cached remainder of
	// text input by the text rate. When detail splits are absent (some
	// events report only totals), detail-classed costs are simply zero —
	// the guard never guesses a split the provider didn't report.
	uncachedText := u.InputTextTokens - u.InputCachedTokens
	if uncachedText < 0 {
		uncachedText = 0
	}
	sum := uncachedText*r.InputTextPerMTokens +
		u.InputCachedTokens*r.InputCachedPerMTokens +
		u.InputAudioTokens*r.InputAudioPerMTokens +
		u.OutputTextTokens*r.OutputTextPerMTokens +
		u.OutputAudioTokens*r.OutputAudioPerMTokens
	return sum / 1_000_000
}

// RealtimeSessionLimits bounds one session. Zero means unlimited.
type RealtimeSessionLimits struct {
	// MaxTotalTokens caps the sum of TotalTokens across the session.
	MaxTotalTokens int64
	// MaxAudioTokens caps input+output audio tokens — the expensive class.
	MaxAudioTokens int64
	// MaxTurns caps completed model turns.
	MaxTurns int64
	// MaxDuration caps wall-clock session age — the one measure that
	// needs no provider cooperation at all.
	MaxDuration time.Duration
	// MaxEstimatedCostMicroUSD caps the running cost estimate. Requires
	// CostRates to be meaningful.
	MaxEstimatedCostMicroUSD int64
}

// RealtimeDecision is the guard's verdict after an observation.
type RealtimeDecision struct {
	// Exceeded is terminal: once true, every later decision stays true.
	Exceeded bool
	// Reason names the first limit breached: "total_tokens",
	// "audio_tokens", "turns", "duration", "cost". Empty while within
	// budget.
	Reason string
	// Totals is the session's accumulated usage so far.
	Totals RealtimeUsage
	// Turns is completed model turns so far.
	Turns int64
	// EstimatedCostMicroUSD is the running estimate (0 without CostRates).
	EstimatedCostMicroUSD int64
	// Elapsed is wall-clock session age.
	Elapsed time.Duration
}

// RealtimeSessionGuardOptions configures a guard.
type RealtimeSessionGuardOptions struct {
	Limits    RealtimeSessionLimits
	CostRates RealtimeCostRates
	// OnExceeded fires exactly once, on the observation that first
	// breaches a limit. Runs synchronously on the observing goroutine —
	// keep it short (signal your socket loop; don't do I/O in it).
	OnExceeded func(RealtimeDecision)
	// Clock defaults to the system clock. Injectable for tests.
	Clock Clock
}

// RealtimeSessionGuard accumulates realtime usage for ONE session and
// enforces its limits. Safe for concurrent use; create one per session.
type RealtimeSessionGuard struct {
	mu       sync.Mutex
	provider RealtimeProvider
	opts     RealtimeSessionGuardOptions
	clock    Clock
	started  time.Time

	totals   RealtimeUsage
	turns    int64
	cost     int64
	exceeded bool
	reason   string
	notified bool
}

// NewRealtimeSessionGuard creates a guard for one session.
func NewRealtimeSessionGuard(provider RealtimeProvider, opts RealtimeSessionGuardOptions) *RealtimeSessionGuard {
	clock := opts.Clock
	if clock == nil {
		clock = systemClock{}
	}
	return &RealtimeSessionGuard{
		provider: provider,
		opts:     opts,
		clock:    clock,
		started:  clock.Now(),
	}
}

// ObserveRaw parses one inbound server frame and feeds it to the guard.
// The raw bytes are read, never modified — the caller's socket loop owns
// the actual traffic.
func (g *RealtimeSessionGuard) ObserveRaw(raw []byte) (RealtimeEvent, RealtimeDecision, error) {
	ev, err := ParseRealtimeEvent(g.provider, raw)
	if err != nil {
		return RealtimeEvent{}, g.Peek(), err
	}
	return ev, g.ObserveEvent(ev), nil
}

// ObserveEvent feeds an already-parsed event to the guard.
func (g *RealtimeSessionGuard) ObserveEvent(ev RealtimeEvent) RealtimeDecision {
	g.mu.Lock()
	if ev.Usage != nil {
		g.totals = g.totals.add(*ev.Usage)
		g.cost += g.opts.CostRates.costMicroUSD(*ev.Usage)
	}
	if ev.TurnComplete {
		g.turns++
	}
	decision, fire := g.commitLocked()
	g.mu.Unlock()

	if fire != nil {
		fire(decision)
	}
	return decision
}

// Tick is an observation of nothing but time — for a timer loop
// enforcing MaxDuration on a session that has gone quiet (no events, so
// ObserveEvent never runs). Mutating like ObserveEvent: a duration
// breach becomes terminal and fires OnExceeded.
func (g *RealtimeSessionGuard) Tick() RealtimeDecision {
	g.mu.Lock()
	decision, fire := g.commitLocked()
	g.mu.Unlock()

	if fire != nil {
		fire(decision)
	}
	return decision
}

// Peek reports the current verdict without observing anything —
// pre-flight semantics: no state change, never fires OnExceeded
// (rule 10). A not-yet-committed duration breach is REPORTED (derived
// from the clock) but not stored — the next Observe/Tick commits it.
func (g *RealtimeSessionGuard) Peek() RealtimeDecision {
	g.mu.Lock()
	defer g.mu.Unlock()
	elapsed := g.clock.Now().Sub(g.started)
	decision := g.decisionLocked(elapsed)
	if !g.exceeded {
		if reason := g.breachLocked(elapsed); reason != "" {
			decision.Exceeded = true
			decision.Reason = reason
		}
	}
	return decision
}

// breachLocked is the pure limit check: reason of the first breached
// limit, or "". Never writes state. Callers hold g.mu.
func (g *RealtimeSessionGuard) breachLocked(elapsed time.Duration) string {
	l := g.opts.Limits
	switch {
	case l.MaxTotalTokens > 0 && g.totals.TotalTokens > l.MaxTotalTokens:
		return "total_tokens"
	case l.MaxAudioTokens > 0 && g.totals.InputAudioTokens+g.totals.OutputAudioTokens > l.MaxAudioTokens:
		return "audio_tokens"
	case l.MaxTurns > 0 && g.turns > l.MaxTurns:
		return "turns"
	case l.MaxDuration > 0 && elapsed > l.MaxDuration:
		return "duration"
	case l.MaxEstimatedCostMicroUSD > 0 && g.cost > l.MaxEstimatedCostMicroUSD:
		return "cost"
	default:
		return ""
	}
}

// commitLocked promotes a breach to terminal state and hands back the
// callback to fire after unlock (nil when nothing newly fired).
func (g *RealtimeSessionGuard) commitLocked() (RealtimeDecision, func(RealtimeDecision)) {
	elapsed := g.clock.Now().Sub(g.started)
	if !g.exceeded {
		if reason := g.breachLocked(elapsed); reason != "" {
			g.exceeded, g.reason = true, reason
		}
	}
	decision := g.decisionLocked(elapsed)
	if g.exceeded && !g.notified && g.opts.OnExceeded != nil {
		g.notified = true
		return decision, g.opts.OnExceeded
	}
	return decision, nil
}

func (g *RealtimeSessionGuard) decisionLocked(elapsed time.Duration) RealtimeDecision {
	return RealtimeDecision{
		Exceeded:              g.exceeded,
		Reason:                g.reason,
		Totals:                g.totals,
		Turns:                 g.turns,
		EstimatedCostMicroUSD: g.cost,
		Elapsed:               elapsed,
	}
}
