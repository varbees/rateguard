package rateguard

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"sync"
)

// ── Loop Detection — Payload Fingerprint Hashing ──
//
// RateGuard detects runaway agent loops by hashing outbound prompt payloads
// and tracking execution sequence depth. When an identical payload fingerprint
// repeats across incrementing sequence depths, it signals a recursive agent loop
// that must be halted before it consumes the developer's API budget.
//
// Technique: SR-LoopShield inspired payload fingerprinting
//   fingerprint = SHA256(system_prompt + user_input + tool_definitions)
//   If fingerprint repeats at a higher sequence depth, halt execution.
//   If sequence depth exceeds maxDepth, halt execution regardless of repeats.

const defaultLoopDetectorCapacity = 10000

// LoopDetector tracks payload fingerprints to detect recursive agent loops.
type LoopDetector struct {
	mu           sync.Mutex
	fingerprints *boundedCache[string, *fingerprintEntry]
	maxDepth     int
}

type fingerprintEntry struct {
	depth  int  // highest sequence depth seen for this fingerprint
	halted bool // whether this fingerprint has been halted
}

// NewLoopDetector creates a loop detector with the given max sequence depth.
// maxDepth: maximum allowed depth before halting (default: 50).
func NewLoopDetector(maxDepth int) *LoopDetector {
	if maxDepth <= 0 {
		maxDepth = 50
	}
	return &LoopDetector{
		fingerprints: newBoundedCache[string, *fingerprintEntry](defaultLoopDetectorCapacity),
		maxDepth:     maxDepth,
	}
}

// Fingerprint generates a SHA-256 hash of the combined prompt context.
// This is the core loop detection primitive — identical payloads produce
// identical fingerprints regardless of request metadata.
func Fingerprint(systemPrompt, userInput, toolDefinitions string) string {
	h := sha256.New()
	h.Write([]byte(systemPrompt))
	h.Write([]byte(userInput))
	h.Write([]byte(toolDefinitions))
	return hex.EncodeToString(h.Sum(nil))
}

// Check evaluates a payload fingerprint at the given sequence depth and
// records it for future checks.
// Returns true if the request should be allowed, false if a loop is detected.
// sequenceDepth comes from the X-Sequence-Depth header or similar agent tracking.
func (ld *LoopDetector) Check(fingerprint string, sequenceDepth int) (allowed bool, reason string) {
	return ld.evaluate(fingerprint, sequenceDepth, true)
}

// Peek evaluates a fingerprint without recording it — a pre-flight query.
func (ld *LoopDetector) Peek(fingerprint string, sequenceDepth int) (allowed bool, reason string) {
	return ld.evaluate(fingerprint, sequenceDepth, false)
}

func (ld *LoopDetector) evaluate(fingerprint string, sequenceDepth int, record bool) (allowed bool, reason string) {
	if ld == nil {
		return true, ""
	}

	ld.mu.Lock()
	defer ld.mu.Unlock()

	if sequenceDepth > ld.maxDepth {
		if record {
			if ld.fingerprints == nil {
				ld.fingerprints = newBoundedCache[string, *fingerprintEntry](defaultLoopDetectorCapacity)
			}
			ld.fingerprints.set(fingerprint, &fingerprintEntry{depth: sequenceDepth, halted: true})
		}
		return false, fmt.Sprintf("max sequence depth exceeded: depth %d > limit %d", sequenceDepth, ld.maxDepth)
	}

	if ld.fingerprints == nil {
		if !record {
			return true, ""
		}
		ld.fingerprints = newBoundedCache[string, *fingerprintEntry](defaultLoopDetectorCapacity)
	}

	entry, exists := ld.fingerprints.get(fingerprint)
	if !exists {
		if record {
			ld.fingerprints.set(fingerprint, &fingerprintEntry{depth: sequenceDepth})
		}
		return true, ""
	}

	if entry.halted {
		return false, fmt.Sprintf("execution halted: payload fingerprint %s was previously blocked for loop behavior at depth %d", shortFingerprint(fingerprint), entry.depth)
	}

	// Same fingerprint, higher sequence depth → recursive loop detected
	if sequenceDepth > entry.depth {
		if record {
			entry.halted = true
		}
		return false, fmt.Sprintf("loop detected: payload fingerprint %s repeated at depth %d (previously seen at depth %d)", shortFingerprint(fingerprint), sequenceDepth, entry.depth)
	}

	// Same depth or lower — normal retry, not a loop
	if record {
		entry.depth = sequenceDepth
	}
	return true, ""
}

// LoopCheck is a convenience method that fingerprints and checks in one call.
func (ld *LoopDetector) LoopCheck(systemPrompt, userInput, toolDefinitions string, sequenceDepth int) (allowed bool, reason string) {
	fp := Fingerprint(systemPrompt, userInput, toolDefinitions)
	return ld.Check(fp, sequenceDepth)
}

// Reset clears all fingerprint state. Use between sessions or tests.
func (ld *LoopDetector) Reset() {
	if ld == nil {
		return
	}
	ld.mu.Lock()
	defer ld.mu.Unlock()
	ld.fingerprints = newBoundedCache[string, *fingerprintEntry](defaultLoopDetectorCapacity)
}

// Stats returns the current detector state for observability.
func (ld *LoopDetector) Stats() map[string]any {
	if ld == nil {
		return map[string]any{"enabled": false}
	}
	ld.mu.Lock()
	defer ld.mu.Unlock()

	halted := 0
	total := 0
	if ld.fingerprints != nil {
		total = ld.fingerprints.len()
		for _, elem := range ld.fingerprints.items {
			if elem.Value.(boundedCacheEntry[string, *fingerprintEntry]).value.halted {
				halted++
			}
		}
	}

	return map[string]any{
		"enabled":            true,
		"max_depth":          ld.maxDepth,
		"total_fingerprints": total,
		"halted":             halted,
	}
}

func shortFingerprint(fingerprint string) string {
	if len(fingerprint) > 12 {
		return fingerprint[:12]
	}
	return fingerprint
}
