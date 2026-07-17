package rateguard

import (
	"testing"
)

// ── Agent rule 5: "Pre-flight queries never consume. Peek, never Allow." ──
//
// This is a SECURITY property, not a nicety. The whole agent story is that a
// model can ask "can I afford this call?" before making it. If the asking
// itself spends, then the safety check IS the leak — and the more careful the
// agent, the faster it burns. An agent that politely checks before every call
// would drain a budget twice as fast as one that never checks at all.
//
// Rule 5 lived in AGENTS.md as prose, enforced by an agent remembering it,
// with exactly one tool (get_rate_limit_state) covering it by test. These
// cover every query tool, and the test file is named after the rule it
// defends so a future reader knows what breaking it means.
//
// The one deliberate exception is check_loop with record=true: an explicit,
// opt-in mutation. That is the shape rule 5 wants — peek by default, consume
// only when asked, never by surprise. Asserted in both directions below.

func TestRule5_GetTokenBudgetNeverConsumes(t *testing.T) {
	// The money one. If asking "how much budget is left?" spends budget, a
	// careful agent starves itself.
	sdk := New(Config{Preset: "dev", TokenBudgetPerHour: 10_000, TokenBudgetMode: TokenBudgetModeHardStop})

	first, err := sdk.mcpGetTokenBudget(map[string]any{"key": "peek-tenant"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Ask repeatedly — a consuming query would drift with every call.
	for i := 0; i < 20; i++ {
		if _, err := sdk.mcpGetTokenBudget(map[string]any{"key": "peek-tenant"}); err != nil {
			t.Fatalf("call %d: %v", i, err)
		}
	}
	last, err := sdk.mcpGetTokenBudget(map[string]any{"key": "peek-tenant"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if first["remaining"] != last["remaining"] {
		t.Fatalf("rule 5 violated: 22 budget queries moved remaining from %v to %v — "+
			"asking the budget must never spend it", first["remaining"], last["remaining"])
	}
}

func TestRule5_GetTokenBudgetWithEstimateNeverConsumes(t *testing.T) {
	// "Would 5000 tokens fit?" is the question agents actually ask. Answering
	// it must not reserve the 5000.
	sdk := New(Config{Preset: "dev", TokenBudgetPerHour: 10_000, TokenBudgetMode: TokenBudgetModeHardStop})

	before, err := sdk.mcpGetTokenBudget(map[string]any{"key": "t"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for i := 0; i < 5; i++ {
		if _, err := sdk.mcpGetTokenBudget(map[string]any{"key": "t", "estimated_tokens": float64(5000)}); err != nil {
			t.Fatalf("estimate query %d: %v", i, err)
		}
	}
	after, err := sdk.mcpGetTokenBudget(map[string]any{"key": "t"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if before["remaining"] != after["remaining"] {
		t.Fatalf("rule 5 violated: five 'would 5000 fit?' queries moved remaining from %v to %v — "+
			"a fit-check must not reserve what it asks about", before["remaining"], after["remaining"])
	}
}

func TestRule5_GetCircuitBreakerStateNeverTrips(t *testing.T) {
	// Reading a breaker must not count as a failure against it, or an agent
	// checking health would eventually declare the provider dead.
	sdk := New(Config{Preset: "dev"})

	first, err := sdk.mcpGetCircuitBreakerState(map[string]any{"key": "openai"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for i := 0; i < 50; i++ {
		if _, err := sdk.mcpGetCircuitBreakerState(map[string]any{"key": "openai"}); err != nil {
			t.Fatalf("call %d: %v", i, err)
		}
	}
	last, err := sdk.mcpGetCircuitBreakerState(map[string]any{"key": "openai"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if first["state"] != last["state"] {
		t.Fatalf("rule 5 violated: 52 breaker reads moved state from %v to %v", first["state"], last["state"])
	}
}

// TestRule5_CheckLoopDoesNotRecordByDefault is the subtle one.
//
// Loop detection works by remembering fingerprints. So a "check" that records
// what it checked would report a loop the agent never made: ask twice, and the
// second answer is "you're looping" — caused entirely by the asking. The agent
// would then halt itself over its own diligence.
func TestRule5_CheckLoopDoesNotRecordByDefault(t *testing.T) {
	sdk := New(Config{Preset: "dev"})

	probe := func(depth int) map[string]any {
		t.Helper()
		got, err := sdk.mcpCheckLoop(map[string]any{
			"system_prompt":  "you are a helpful agent",
			"user_input":     "book the flight",
			"sequence_depth": float64(depth),
		})
		if err != nil {
			t.Fatalf("check at depth %d: %v", depth, err)
		}
		return got
	}

	// The tool reports a loop via allowed=false, NOT a "loop_detected" field.
	// Two earlier drafts of this test were VACUOUS and both passed while
	// proving nothing:
	//
	//   1. asserted on "loop_detected", which does not exist — so the
	//      condition could never be true, and the test could never fail.
	//   2. probed the same depth repeatedly. A loop fires when a fingerprint
	//      reappears at a HIGHER depth than before, so same-depth probing
	//      cannot observe recording at all. Verified by flipping the default
	//      to record=true: the test still passed.
	//
	// Depth must ESCALATE, which is also the real runaway shape: an agent
	// repeating itself deeper into its own loop. If a passive check secretly
	// recorded at depth 1, the depth-9 probe below reports a loop the agent
	// never made.
	if first := probe(1); first["allowed"] != true {
		t.Fatalf("a fresh fingerprint was denied on its first check: %+v", first)
	}
	for depth := 2; depth <= 9; depth++ {
		if got := probe(depth); got["allowed"] != true {
			t.Fatalf("rule 5 violated: probing depth %d reported a loop the agent never made "+
				"(%+v) — check_loop recorded the fingerprint it was only asked to check, so "+
				"an agent that checks carefully halts itself over its own diligence", depth, got)
		}
	}
}

// TestRule5_CheckLoopRecordsWhenAskedTo asserts the deliberate exception.
// Peek by default, consume only on request — the exception proves the rule is
// a choice rather than an accident of implementation.
func TestRule5_CheckLoopRecordsWhenAskedTo(t *testing.T) {
	sdk := New(Config{Preset: "dev"})

	record := map[string]any{
		"system_prompt":  "you are a helpful agent",
		"user_input":     "book the flight",
		"sequence_depth": float64(1),
		"record":         true,
	}
	if _, err := sdk.mcpCheckLoop(record); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// The same payload at a HIGHER depth is the runaway shape: the agent is
	// repeating itself deeper into its own loop.
	deeper := map[string]any{
		"system_prompt":  "you are a helpful agent",
		"user_input":     "book the flight",
		"sequence_depth": float64(5),
	}
	got, err := sdk.mcpCheckLoop(deeper)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got["allowed"] != false {
		t.Fatalf("record=true did not record: a repeated payload at depth 5 was not "+
			"detected as a loop (got %+v)", got)
	}
}

// TestRule5_QueriesDoNotConsumeAcrossTheWholeToolSurface is the catch-all: it
// drives every query tool many times and asserts the SDK's own admission path
// is unmoved afterwards. A future tool that quietly consumes fails here even
// if nobody writes it a dedicated test.
func TestRule5_QueriesDoNotConsumeAcrossTheWholeToolSurface(t *testing.T) {
	sdk := New(Config{
		Preset:             "dev",
		TokenBudgetPerHour: 10_000,
		TokenBudgetMode:    TokenBudgetModeHardStop,
	})

	const key = "rule5-tenant"

	// Snapshot the real admission state, not a tool's self-report.
	budgetBefore := sdk.tokens.check(key, sdk.Policy())
	limitBefore, err := sdk.limiter.Peek(t.Context(), key, sdk.Policy())
	if err != nil {
		t.Fatalf("peek: %v", err)
	}

	for i := 0; i < 25; i++ {
		if _, err := sdk.mcpGetTokenBudget(map[string]any{"key": key, "estimated_tokens": float64(100)}); err != nil {
			t.Fatalf("get_token_budget: %v", err)
		}
		if _, err := sdk.mcpGetRateLimitState(map[string]any{"key": key}); err != nil {
			t.Fatalf("get_rate_limit_state: %v", err)
		}
		if _, err := sdk.mcpGetCircuitBreakerState(map[string]any{"key": key}); err != nil {
			t.Fatalf("get_circuit_breaker_state: %v", err)
		}
		if _, err := sdk.mcpCheckLoop(map[string]any{
			"system_prompt": "s", "user_input": "u", "sequence_depth": float64(1),
		}); err != nil {
			t.Fatalf("check_loop: %v", err)
		}
	}

	budgetAfter := sdk.tokens.check(key, sdk.Policy())
	limitAfter, err := sdk.limiter.Peek(t.Context(), key, sdk.Policy())
	if err != nil {
		t.Fatalf("peek: %v", err)
	}

	if budgetBefore.Remaining != budgetAfter.Remaining {
		t.Fatalf("rule 5 violated: 100 pre-flight queries moved the token budget from %d to %d",
			budgetBefore.Remaining, budgetAfter.Remaining)
	}
	if limitBefore.Remaining != limitAfter.Remaining {
		t.Fatalf("rule 5 violated: 100 pre-flight queries moved the rate limit from %d to %d",
			limitBefore.Remaining, limitAfter.Remaining)
	}
}
