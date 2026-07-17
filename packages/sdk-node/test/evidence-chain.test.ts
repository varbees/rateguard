/**
 * Evidence chain: hash linking, tamper detection, external signers, and the
 * evidence package — mirrors Go's evidence_chain_test.go.
 */

import { createPublicKey } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { privateKeyFromRaw, publicKeyToRaw } from '../src/core/budget-attestation.js';
import {
  EvidenceChain,
  GENESIS_PREV_HASH,
  evidencePackageFromJSON,
  issueSpendReceiptWithSigner,
  keySigner,
  marshalEvidencePackage,
  verifyEvidenceChain,
  verifyEvidencePackage,
  type Signer,
} from '../src/core/evidence-chain.js';
import { issueSpendReceipt, verifySpendReceipt, type SpendReceiptClaims } from '../src/core/spend-receipt.js';

const ISSUED_AT = 1_700_000_000;
const EXPORTED_AT = 1_700_010_000;

function keyFromSeedByte(b: number) {
  const priv = privateKeyFromRaw(Buffer.alloc(32, b));
  return { priv, pub: publicKeyToRaw(createPublicKey(priv)) };
}

function testClaims(tokens: number, costMicroUSD: number): SpendReceiptClaims {
  return {
    key: 'agent-1',
    provider: 'openai',
    model: 'gpt-4o',
    windowStartUnix: 1_700_000_000,
    windowEndUnix: 1_700_003_600,
    inputTokens: Math.floor(tokens / 2),
    outputTokens: tokens - Math.floor(tokens / 2),
    totalTokens: tokens,
    estimatedCostMicroUSD: costMicroUSD,
  };
}

/** Build a chain of n receipts signed by a fixed key. */
function chainOf(n: number) {
  const { priv, pub } = keyFromSeedByte(1);
  const chain = new EvidenceChain();
  for (let i = 0; i < n; i++) {
    chain.append(issueSpendReceipt(priv, testClaims(100 * (i + 1), 1000 * (i + 1)), ISSUED_AT));
  }
  return { chain, pub, priv };
}

describe('EvidenceChain linking', () => {
  it('links entries and verifies end to end', () => {
    const { chain, pub } = chainOf(4);
    expect(chain.length).toBe(4);

    const entries = chain.entries();
    expect(entries[0]!.prevHash).toBe(GENESIS_PREV_HASH);
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i]!.prevHash).toBe(entries[i - 1]!.entryHash);
      expect(entries[i]!.seq).toBe(i);
    }
    expect(chain.head).toBe(entries[entries.length - 1]!.entryHash);
    expect(() => verifyEvidenceChain(pub, entries, chain.head)).not.toThrow();
  });

  it('an empty chain heads at genesis and cannot export', () => {
    const c = new EvidenceChain();
    expect(c.head).toBe(GENESIS_PREV_HASH);
    expect(() => verifyEvidenceChain(null, c.entries(), GENESIS_PREV_HASH)).not.toThrow();
    expect(() => c.exportEvidence()).toThrow(/empty evidence chain/);
  });

  it('refuses to chain an unverifiable receipt', () => {
    const { priv } = keyFromSeedByte(1);
    const r = issueSpendReceipt(priv, testClaims(100, 1000), ISSUED_AT);
    r.claims.totalTokens = 999_999; // signature no longer covers this

    const c = new EvidenceChain();
    expect(() => c.append(r)).toThrow(/unverifiable receipt/);
    expect(c.length).toBe(0);
  });
});

describe('EvidenceChain tamper detection', () => {
  // The attack the chain exists to catch: drop an expensive receipt from the
  // middle. Every REMAINING receipt still has a valid signature — only the
  // links expose the deletion.
  it('detects a deleted entry whose neighbours still verify', () => {
    const { chain, pub } = chainOf(4);
    const entries = chain.entries();

    for (const e of entries) {
      expect(() => verifySpendReceipt(pub, e.receipt)).not.toThrow();
    }

    const doctored = [...entries.slice(0, 2), ...entries.slice(3)];
    expect(() => verifyEvidenceChain(pub, doctored)).toThrow(/seq|chain broken/);
  });

  it('detects reordered entries', () => {
    const { chain, pub } = chainOf(3);
    const e = chain.entries();
    expect(() => verifyEvidenceChain(pub, [e[1]!, e[0]!, e[2]!])).toThrow();
  });

  // Altering a claim breaks the receipt signature before the hash is even
  // consulted — asserted so the two layers stay independently effective.
  it('detects an altered claim via the signature', () => {
    const { chain, pub } = chainOf(3);
    const entries = chain.entries();
    entries[1]!.receipt.claims.estimatedCostMicroUSD = 1;
    expect(() => verifyEvidenceChain(pub, entries)).toThrow(/signature/);
  });

  it('detects a rewritten hash', () => {
    const { chain, pub } = chainOf(3);
    const entries = chain.entries();
    entries[2]!.entryHash = 'ab'.repeat(32);
    expect(() => verifyEvidenceChain(pub, entries)).toThrow(/hash mismatch/);
  });

  // The wantHead check is what catches a WHOLESALE rewrite: an issuer holding
  // the key rebuilds an internally-consistent chain, and only a head recorded
  // externally exposes it. This is the property the docs hang the "witness the
  // head" instruction on, so it gets a test.
  it('a witnessed head catches a wholesale rewrite', () => {
    const { chain, pub, priv } = chainOf(3);
    const witnessedHead = chain.head;

    const rebuilt = new EvidenceChain();
    for (let i = 0; i < 2; i++) {
      // the expensive third receipt quietly omitted
      rebuilt.append(issueSpendReceipt(priv, testClaims(100 * (i + 1), 1000 * (i + 1)), ISSUED_AT));
    }

    // The rebuilt chain is internally flawless — that is the point.
    expect(() => verifyEvidenceChain(pub, rebuilt.entries())).not.toThrow();
    // Only the externally-witnessed head exposes it.
    expect(() => verifyEvidenceChain(pub, rebuilt.entries(), witnessedHead)).toThrow(/head/);
  });

  it('pins the issuer', () => {
    const { chain } = chainOf(2);
    const { pub: otherPub } = keyFromSeedByte(7);
    // A chain signed by an attacker's own key is internally valid; pinning is
    // the only thing that rejects it.
    expect(() => verifyEvidenceChain(null, chain.entries())).not.toThrow();
    expect(() => verifyEvidenceChain(otherPub, chain.entries())).toThrow(/trusted issuer/);
  });
});

describe('Signer', () => {
  it('the keySigner path matches the direct path byte for byte', () => {
    const { priv, pub } = keyFromSeedByte(1);
    const claims = testClaims(100, 1000);

    const direct = issueSpendReceipt(priv, claims, ISSUED_AT);
    const viaSigner = issueSpendReceiptWithSigner(keySigner(priv), claims, ISSUED_AT);

    // Ed25519 is deterministic: the same key over the same payload must
    // produce the same signature. The signer path is a routing change, not a
    // format change.
    expect(viaSigner.signature.equals(direct.signature)).toBe(true);
    expect(() => verifySpendReceipt(pub, viaSigner)).not.toThrow();
  });

  it('surfaces a signer failure', () => {
    const { pub } = keyFromSeedByte(1);
    const failing: Signer = {
      publicKey: () => pub,
      sign: () => {
        throw new Error('kms unavailable');
      },
    };
    expect(() => issueSpendReceiptWithSigner(failing, testClaims(100, 1000), ISSUED_AT)).toThrow(
      /kms unavailable/,
    );
  });

  // A KMS signing with a key other than the one it advertises would mint
  // receipts that fail verification later, in an auditor's hands. Catch it at
  // issue time instead.
  it('rejects a signer that signs with a key other than it advertises', () => {
    const { pub } = keyFromSeedByte(1);
    const { priv: otherPriv } = keyFromSeedByte(9);
    // Advertises key 1, signs with key 9 — a KMS pointed at the wrong alias.
    const wrongKey: Signer = {
      publicKey: () => pub,
      sign: (payload) => keySigner(otherPriv).sign(payload),
    };
    expect(() => issueSpendReceiptWithSigner(wrongKey, testClaims(100, 1000), ISSUED_AT)).toThrow(
      /does not verify/,
    );
  });

  it('rejects a malformed signer public key', () => {
    const bad: Signer = { publicKey: () => Buffer.alloc(8), sign: () => Buffer.alloc(64) };
    expect(() => issueSpendReceiptWithSigner(bad, testClaims(100, 1000), ISSUED_AT)).toThrow(
      /32 bytes/,
    );
  });

  it('rejects a signature of the wrong length', () => {
    const { pub } = keyFromSeedByte(1);
    const short: Signer = { publicKey: () => pub, sign: () => Buffer.alloc(10) };
    expect(() => issueSpendReceiptWithSigner(short, testClaims(100, 1000), ISSUED_AT)).toThrow(
      /10-byte signature/,
    );
  });
});

describe('EvidencePackage', () => {
  it('exports totals, head, and caveats, and verifies', () => {
    const { chain, pub } = chainOf(3);
    const pkg = chain.exportEvidence(EXPORTED_AT);

    expect(pkg.entryCount).toBe(3);
    expect(pkg.entries).toHaveLength(3);
    expect(pkg.chainHead).toBe(chain.head);
    // 100 + 200 + 300 tokens, 1000 + 2000 + 3000 micro-USD.
    expect(pkg.totalTokens).toBe(600);
    expect(pkg.totalEstimatedCostMicroUSD).toBe(6000);
    expect(pkg.caveats.length).toBeGreaterThan(0);
    expect(() => verifyEvidencePackage(pub, pkg)).not.toThrow();
  });

  it('round-trips through JSON and still verifies', () => {
    const { chain, pub } = chainOf(3);
    const pkg = chain.exportEvidence(EXPORTED_AT);

    // The package is a file that travels; it must verify after a round trip
    // through JSON, or the export is decorative.
    const decoded = evidencePackageFromJSON(
      JSON.parse(marshalEvidencePackage(pkg)) as Record<string, unknown>,
    );
    expect(() => verifyEvidencePackage(pub, decoded)).not.toThrow();
    expect(decoded.chainHead).toBe(pkg.chainHead);
    expect(decoded.totalTokens).toBe(pkg.totalTokens);
  });

  // Totals are what an assessor reads. Editing them without touching a
  // receipt must fail, or the summary is a place to hide spend.
  it('detects edited totals', () => {
    const { chain, pub } = chainOf(3);
    const pkg = chain.exportEvidence(EXPORTED_AT);

    const orig = pkg.totalEstimatedCostMicroUSD;
    pkg.totalEstimatedCostMicroUSD = 1;
    expect(() => verifyEvidencePackage(pub, pkg)).toThrow(/micro-USD/);
    pkg.totalEstimatedCostMicroUSD = orig;

    pkg.totalTokens = 1;
    expect(() => verifyEvidencePackage(pub, pkg)).toThrow(/total tokens/);
  });

  it('rejects a malformed package', () => {
    const { chain, pub } = chainOf(2);

    const badVersion = chain.exportEvidence(EXPORTED_AT);
    badVersion.v = 'something-else/9';
    expect(() => verifyEvidencePackage(pub, badVersion)).toThrow(/unsupported evidence package/);

    const miscount = chain.exportEvidence(EXPORTED_AT);
    miscount.entryCount = 99;
    expect(() => verifyEvidencePackage(pub, miscount)).toThrow(/carries/);

    const rewritten = chain.exportEvidence(EXPORTED_AT);
    rewritten.chainHead = 'cd'.repeat(32);
    expect(() => verifyEvidencePackage(pub, rewritten)).toThrow(/head/);
  });
});
