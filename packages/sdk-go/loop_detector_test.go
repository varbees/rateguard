package rateguard

import (
	"testing"
)

func TestFingerprint(t *testing.T) {
	fp1 := Fingerprint("system-a", "user-input", "tool-defs")
	fp2 := Fingerprint("system-a", "user-input", "tool-defs")
	fp3 := Fingerprint("system-b", "user-input", "tool-defs")

	if fp1 != fp2 {
		t.Error("identical inputs should produce identical fingerprints")
	}
	if fp1 == fp3 {
		t.Error("different system prompts should produce different fingerprints")
	}
	if len(fp1) != 64 {
		t.Errorf("expected SHA-256 hex length 64, got %d", len(fp1))
	}
}

func TestLoopDetectorNormalFlow(t *testing.T) {
	ld := NewLoopDetector(50)
	fp := Fingerprint("system", "hello", "")

	// First call at depth 1 — allowed
	allowed, _ := ld.Check(fp, 1)
	if !allowed {
		t.Error("first call should be allowed")
	}

	// Same fingerprint at same depth — allowed (retry)
	allowed, _ = ld.Check(fp, 1)
	if !allowed {
		t.Error("same depth retry should be allowed")
	}
}

func TestLoopDetectorDetectsLoop(t *testing.T) {
	ld := NewLoopDetector(50)
	fp := Fingerprint("system", "hello", "")

	// First call at depth 1
	ld.Check(fp, 1)

	// Same fingerprint at depth 2 — loop detected
	allowed, reason := ld.Check(fp, 2)
	if allowed {
		t.Error("repeated fingerprint at higher depth should be blocked")
	}
	if reason == "" {
		t.Error("loop detection should provide a reason")
	}

	// Subsequent calls with same fingerprint should also be blocked
	allowed, _ = ld.Check(fp, 3)
	if allowed {
		t.Error("halted fingerprint should remain blocked")
	}
}

func TestLoopDetectorDifferentPayloads(t *testing.T) {
	ld := NewLoopDetector(50)

	fp1 := Fingerprint("system", "task-a", "")
	fp2 := Fingerprint("system", "task-b", "")

	// Both are new — should be allowed
	allowed, _ := ld.Check(fp1, 1)
	if !allowed {
		t.Error("fp1 should be allowed")
	}
	allowed, _ = ld.Check(fp2, 1)
	if !allowed {
		t.Error("fp2 should be allowed")
	}

	// fp1 at depth 2 — loop
	allowed, _ = ld.Check(fp1, 2)
	if allowed {
		t.Error("fp1 at higher depth should be blocked")
	}

	// fp2 should still be allowed at its own depth 1
	allowed, _ = ld.Check(fp2, 1) // same depth, normal retry
	if !allowed {
		t.Error("fp2 at same depth should still be allowed")
	}
}

func TestLoopDetectorReset(t *testing.T) {
	ld := NewLoopDetector(50)
	fp := Fingerprint("s", "u", "t")

	ld.Check(fp, 1)
	ld.Check(fp, 2) // halts

	ld.Reset()

	// After reset, same fingerprint should be allowed again
	allowed, _ := ld.Check(fp, 1)
	if !allowed {
		t.Error("after reset, fingerprint should be allowed")
	}
}

func TestLoopDetectorStats(t *testing.T) {
	ld := NewLoopDetector(50)

	stats := ld.Stats()
	if !stats["enabled"].(bool) {
		t.Error("detector should be enabled")
	}
	if stats["max_depth"].(int) != 50 {
		t.Errorf("expected max_depth 50, got %v", stats["max_depth"])
	}

	// Trigger a halt
	fp := Fingerprint("s", "u", "t")
	ld.Check(fp, 1)
	ld.Check(fp, 2)

	stats = ld.Stats()
	if stats["halted"].(int) != 1 {
		t.Errorf("expected 1 halted, got %v", stats["halted"])
	}
}

func TestNilLoopDetector(t *testing.T) {
	var ld *LoopDetector = nil

	// Nil detector should always allow (graceful degradation)
	allowed, _ := ld.Check("any-fingerprint", 100)
	if !allowed {
		t.Error("nil detector should always allow")
	}

	allowed, _ = ld.LoopCheck("s", "u", "t", 100)
	if !allowed {
		t.Error("nil detector LoopCheck should always allow")
	}

	stats := ld.Stats()
	if stats["enabled"].(bool) {
		t.Error("nil detector stats should show disabled")
	}
}
