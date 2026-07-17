/**
 * Semantic Loop Detection tests — mirrors Go semantic_loop_test.go and
 * Python test_semantic_loop.py.
 *
 * Uses a fixed-vector embedder to test the detector mechanics without
 * needing a real .rgemb model file.
 */

import { describe, it, expect } from "vitest";
import { SemanticLoopDetector, SemanticLoopOptions } from "../src/core/semantic-loop";

// ── Fixed-vector embedder (mirrors Python FixedVecEmbedder) ──────

class FixedVecEmbedder {
  private vecs: Record<string, number[]> = {
    A:   [1, 0],
    "A'": [0.999, 0.045],
    A2:  [0.998, 0.06],
    B:   [0, 1],
    C:   [0.7071, 0.7071],
    Z:   [0, 0],
  };

  async embed(text: string): Promise<number[]> {
    return (this.vecs[text] ?? [0, 0]).map(v => v);
  }
}

// ── Tests ─────────────────────────────────────────────────────────

describe("SemanticLoopDetector", () => {
  it("trips on paraphrase ping-pong", async () => {
    const d = new SemanticLoopDetector(new FixedVecEmbedder());
    const steps: [string, boolean][] = [
      ["A",  false],
      ["B",  false],
      ["A'", false],
      ["B",  false],
      ["A2", true],
    ];
    for (const [text, wantLoop] of steps) {
      const dec = await d.check("agent-1", text);
      expect(dec.loop).toBe(wantLoop);
    }
  });

  it("ignores distinct steps", async () => {
    const d = new SemanticLoopDetector(new FixedVecEmbedder());
    // A and C are related but distinct (cosine ≈ 0.707, below threshold)
    const first = await d.check("agent-2", "A");
    expect(first.matches).toBe(0);

    const c1 = await d.check("agent-2", "C");
    expect(c1.matches).toBe(0);

    const a2 = await d.check("agent-2", "A");
    expect(a2.matches).toBe(1);
    expect(a2.loop).toBe(false);

    const c2 = await d.check("agent-2", "C");
    expect(c2.matches).toBe(1);
    expect(c2.loop).toBe(false);
  });

  it("peek never records", async () => {
    const d = new SemanticLoopDetector(new FixedVecEmbedder());
    for (let i = 0; i < 10; i++) {
      const dec = await d.peek("agent-3", "A");
      expect(dec.loop).toBe(false);
      expect(dec.matches).toBe(0);
    }
    const dec = await d.check("agent-3", "A");
    expect(dec.matches).toBe(0);
  });

  it("respects window bound and reset", async () => {
    const d = new SemanticLoopDetector(
      new FixedVecEmbedder(),
      { window: 2, minRepeats: 2 } as SemanticLoopOptions
    );
    for (const s of ["A", "A'", "B", "B"]) {
      await d.check("agent-4", s);
    }
    // Window now holds [B, B] — A2 matches nothing
    const dec = await d.check("agent-4", "A2");
    expect(dec.matches).toBe(0);

    d.reset("agent-4");
    const dec2 = await d.check("agent-4", "A2");
    expect(dec2.matches).toBe(0);
    expect(dec2.loop).toBe(false);
  });

  it("zero vector matches nothing", async () => {
    const d = new SemanticLoopDetector(new FixedVecEmbedder());
    // Z is zero vector — cosine similarity with anything is undefined/0
    const z1 = await d.check("agent-5", "Z");
    expect(z1.matches).toBe(0);
    const z2 = await d.check("agent-5", "Z");
    expect(z2.matches).toBe(0);
    const z3 = await d.check("agent-5", "Z");
    expect(z3.loop).toBe(false);
  });
});

// ── Real-model reproduction (gated) — the documented $47K loop shape ──
//
// RATEGUARD_EMBED_MODEL=/path/to/potion-base-2M.rgemb bun run test
// Two agents ping-pong the same request in different words every turn:
// SHA-256 fingerprints all differ; the semantic detector must trip.

describe.skipIf(!process.env.RATEGUARD_EMBED_MODEL)("real model paraphrase loop", () => {
  it("trips on the reworded ping-pong, stays silent on distinct steps", async () => {
    const { StaticEmbedder } = await import("../src/core/static-embedder");
    const { createHash } = await import("node:crypto");
    const e = StaticEmbedder.load(process.env.RATEGUARD_EMBED_MODEL!);
    const d = new SemanticLoopDetector(e);

    const steps = [
      "Please verify the market analysis report for the renewable energy sector.",
      "The analysis is incomplete, send the full market report again for review.",
      "Kindly review and verify the renewable energy sector market analysis report.",
      "This analysis remains incomplete, resend the complete market report for review.",
      "Could you verify the market analysis report on the renewable energy sector?",
    ];
    // Every SHA-256 fingerprint must be distinct — the exact-match
    // detector is provably blind to this loop.
    const hashes = new Set(steps.map((s) => createHash("sha256").update(s).digest("hex")));
    expect(hashes.size).toBe(steps.length);

    let tripped = -1;
    for (let i = 0; i < steps.length; i++) {
      const dec = await d.check("analyzer-verifier", steps[i]!);
      if (dec.loop) {
        tripped = i;
        break;
      }
    }
    expect(tripped, "semantic loop detector never tripped on the reworded ping-pong").toBeGreaterThanOrEqual(0);
    expect(tripped).toBeLessThanOrEqual(4);

    const control = [
      "Search the web for current renewable energy market size figures.",
      "Summarize the top three findings from the search results.",
      "Draft an executive summary paragraph from the findings.",
      "Create a table comparing solar and wind capacity growth.",
      "Write the conclusion section referencing the comparison table.",
    ];
    for (const s of control) {
      const dec = await d.check("control", s);
      expect(dec.loop, `false positive on distinct step: ${s}`).toBe(false);
    }
  });
});
