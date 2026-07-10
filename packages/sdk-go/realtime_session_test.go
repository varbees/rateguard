package rateguard

import (
	"encoding/json"
	"os"
	"testing"
	"time"
)

// ── Conformance: parsers vs conformance/realtime_usage_vectors.json ──
// Gemini cases are REAL frames captured from the live API (2026-07-10);
// OpenAI cases follow the documented response.done schema.

type realtimeVectors struct {
	Cases []struct {
		Name     string          `json:"name"`
		Provider string          `json:"provider"`
		Event    json.RawMessage `json:"event"`
		Expect   struct {
			Type         string         `json:"type"`
			TurnComplete bool           `json:"turn_complete"`
			HasUsage     bool           `json:"has_usage"`
			Usage        *RealtimeUsage `json:"usage"`
		} `json:"expect"`
	} `json:"cases"`
}

func TestRealtimeUsageConformance(t *testing.T) {
	raw, err := os.ReadFile("../../conformance/realtime_usage_vectors.json")
	if err != nil {
		t.Fatalf("read vectors: %v", err)
	}
	var v realtimeVectors
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatalf("parse vectors: %v", err)
	}
	if len(v.Cases) == 0 {
		t.Fatal("no vector cases")
	}

	for _, c := range v.Cases {
		t.Run(c.Name, func(t *testing.T) {
			ev, err := ParseRealtimeEvent(RealtimeProvider(c.Provider), c.Event)
			if err != nil {
				t.Fatalf("parse: %v", err)
			}
			if ev.Type != c.Expect.Type {
				t.Fatalf("type = %q, want %q", ev.Type, c.Expect.Type)
			}
			if ev.TurnComplete != c.Expect.TurnComplete {
				t.Fatalf("turnComplete = %v, want %v", ev.TurnComplete, c.Expect.TurnComplete)
			}
			if (ev.Usage != nil) != c.Expect.HasUsage {
				t.Fatalf("hasUsage = %v, want %v", ev.Usage != nil, c.Expect.HasUsage)
			}
			if c.Expect.Usage != nil {
				if *ev.Usage != *c.Expect.Usage {
					t.Fatalf("usage = %+v, want %+v", *ev.Usage, *c.Expect.Usage)
				}
			}
		})
	}
}

// ── Session guard ──

func rtUsageEvent(total, inAudio, outAudio int64, turnComplete bool) RealtimeEvent {
	return RealtimeEvent{
		Provider:     RealtimeProviderOpenAI,
		Type:         "response.done",
		TurnComplete: turnComplete,
		Usage: &RealtimeUsage{
			TotalTokens:       total,
			InputAudioTokens:  inAudio,
			OutputAudioTokens: outAudio,
		},
	}
}

func TestRealtimeGuardSumsUsageAndTripsOnTotalTokens(t *testing.T) {
	var fired []RealtimeDecision
	g := NewRealtimeSessionGuard(RealtimeProviderOpenAI, RealtimeSessionGuardOptions{
		Limits:     RealtimeSessionLimits{MaxTotalTokens: 1000},
		OnExceeded: func(d RealtimeDecision) { fired = append(fired, d) },
	})

	d := g.ObserveEvent(rtUsageEvent(400, 0, 0, true))
	if d.Exceeded || d.Totals.TotalTokens != 400 || d.Turns != 1 {
		t.Fatalf("after turn 1: %+v", d)
	}
	d = g.ObserveEvent(rtUsageEvent(400, 0, 0, true))
	if d.Exceeded {
		t.Fatalf("800 <= 1000 must not trip: %+v", d)
	}
	d = g.ObserveEvent(rtUsageEvent(400, 0, 0, true))
	if !d.Exceeded || d.Reason != "total_tokens" || d.Totals.TotalTokens != 1200 {
		t.Fatalf("1200 > 1000 must trip on total_tokens: %+v", d)
	}
	if len(fired) != 1 {
		t.Fatalf("OnExceeded fired %d times, want exactly 1", len(fired))
	}

	// Terminal: more observations keep reporting exceeded, no re-fire.
	d = g.ObserveEvent(rtUsageEvent(1, 0, 0, false))
	if !d.Exceeded {
		t.Fatal("exceeded must be terminal")
	}
	if len(fired) != 1 {
		t.Fatalf("OnExceeded re-fired: %d", len(fired))
	}
}

func TestRealtimeGuardAudioTokenLimit(t *testing.T) {
	g := NewRealtimeSessionGuard(RealtimeProviderGemini, RealtimeSessionGuardOptions{
		Limits: RealtimeSessionLimits{MaxAudioTokens: 100},
	})
	d := g.ObserveEvent(rtUsageEvent(0, 60, 30, true))
	if d.Exceeded {
		t.Fatalf("90 <= 100: %+v", d)
	}
	d = g.ObserveEvent(rtUsageEvent(0, 6, 6, true))
	if !d.Exceeded || d.Reason != "audio_tokens" {
		t.Fatalf("102 > 100 must trip audio_tokens: %+v", d)
	}
}

func TestRealtimeGuardCostAccounting(t *testing.T) {
	// gpt-realtime-shaped rates: $32/M audio in, $64/M audio out.
	rates := RealtimeCostRates{InputAudioPerMTokens: 32_000_000, OutputAudioPerMTokens: 64_000_000}
	g := NewRealtimeSessionGuard(RealtimeProviderOpenAI, RealtimeSessionGuardOptions{
		Limits:    RealtimeSessionLimits{MaxEstimatedCostMicroUSD: 100_000}, // $0.10
		CostRates: rates,
	})
	// 1000 audio-in + 1000 audio-out = 32_000 + 64_000 = 96_000 µ$ — under.
	d := g.ObserveEvent(rtUsageEvent(0, 1000, 1000, true))
	if d.Exceeded || d.EstimatedCostMicroUSD != 96_000 {
		t.Fatalf("cost after turn 1: %+v", d)
	}
	// +200 audio-in = +6_400 µ$ → 102_400 > 100_000 — trips.
	d = g.ObserveEvent(rtUsageEvent(0, 200, 0, true))
	if !d.Exceeded || d.Reason != "cost" || d.EstimatedCostMicroUSD != 102_400 {
		t.Fatalf("cost must trip: %+v", d)
	}
}

func TestRealtimeGuardCachedInputPricing(t *testing.T) {
	rates := RealtimeCostRates{InputTextPerMTokens: 4_000_000, InputCachedPerMTokens: 400_000}
	g := NewRealtimeSessionGuard(RealtimeProviderOpenAI, RealtimeSessionGuardOptions{CostRates: rates})
	d := g.ObserveEvent(RealtimeEvent{Usage: &RealtimeUsage{
		InputTextTokens: 1000, InputCachedTokens: 600,
	}})
	// 400 uncached × $4/M + 600 cached × $0.4/M = 1600 + 240 = 1840 µ$.
	if d.EstimatedCostMicroUSD != 1_840 {
		t.Fatalf("cached-split cost = %d, want 1840", d.EstimatedCostMicroUSD)
	}
}

func TestRealtimeGuardDurationViaTickAndPeekPurity(t *testing.T) {
	clock := &fakeClock{now: time.Unix(1_780_000_000, 0)}
	fired := 0
	g := NewRealtimeSessionGuard(RealtimeProviderOpenAI, RealtimeSessionGuardOptions{
		Limits:     RealtimeSessionLimits{MaxDuration: time.Minute},
		OnExceeded: func(RealtimeDecision) { fired++ },
		Clock:      clock,
	})

	clock.now = clock.now.Add(2 * time.Minute)

	// Peek reports the derived breach but must not commit or fire.
	p := g.Peek()
	if !p.Exceeded || p.Reason != "duration" {
		t.Fatalf("peek should report derived duration breach: %+v", p)
	}
	if fired != 0 {
		t.Fatal("Peek fired OnExceeded — pre-flight must never mutate")
	}
	p = g.Peek() // repeatable
	if !p.Exceeded || fired != 0 {
		t.Fatal("second Peek changed behavior")
	}

	// Tick commits and fires exactly once.
	d := g.Tick()
	if !d.Exceeded || d.Reason != "duration" || fired != 1 {
		t.Fatalf("tick: %+v fired=%d", d, fired)
	}
	_ = g.Tick()
	if fired != 1 {
		t.Fatalf("tick re-fired: %d", fired)
	}
}

func TestRealtimeGuardObserveRawEndToEnd(t *testing.T) {
	// Feed the REAL captured Gemini usage frame through ObserveRaw.
	raw, err := os.ReadFile("../../conformance/realtime_usage_vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var v realtimeVectors
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatal(err)
	}
	var geminiFrame json.RawMessage
	for _, c := range v.Cases {
		if c.Provider == "gemini" && c.Expect.HasUsage {
			geminiFrame = c.Event
			break
		}
	}
	if geminiFrame == nil {
		t.Fatal("no gemini usage case in vectors")
	}

	g := NewRealtimeSessionGuard(RealtimeProviderGemini, RealtimeSessionGuardOptions{
		Limits: RealtimeSessionLimits{MaxTotalTokens: 500},
	})
	ev, d, err := g.ObserveRaw(geminiFrame)
	if err != nil {
		t.Fatal(err)
	}
	if ev.Usage == nil || d.Totals.TotalTokens != 393 || d.Turns != 1 || d.Exceeded {
		t.Fatalf("first real frame: ev=%+v d=%+v", ev, d)
	}
	// Second identical turn pushes the session over 500 total.
	_, d, err = g.ObserveRaw(geminiFrame)
	if err != nil {
		t.Fatal(err)
	}
	if !d.Exceeded || d.Reason != "total_tokens" || d.Totals.TotalTokens != 786 {
		t.Fatalf("second real frame must trip: %+v", d)
	}

	// Garbage frames error out without corrupting state.
	if _, _, err := g.ObserveRaw([]byte("not json")); err == nil {
		t.Fatal("garbage frame must error")
	}
}
