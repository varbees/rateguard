import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, type KeyObject } from 'node:crypto';
import {
  attest,
  isSubsetOf,
  newRootBudgetToken,
  parseBudgetToken,
  sign,
  verifyChain,
  verifyPresentation,
  type BudgetGrant,
} from '../src/index.js';

// Mirrors packages/sdk-go/budget_attestation_test.go scenario-for-scenario.

function genKey(): { publicKey: KeyObject; privateKey: KeyObject } {
  return generateKeyPairSync('ed25519');
}

// Fixed instant for every test that verifies through the injectable-now
// path (verifyChain(token, root, nowMs)). Tests that verify through a
// real-wall-clock path (verifyPresentation's default now) anchor to
// Date.now() instead — a hardcoded date there is a time bomb that starts
// failing once the calendar passes it (Go's test file had exactly that bug).
const FIXED_NOW = Date.UTC(2026, 6, 5, 12, 0, 0);

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

function rootGrant(nowMs: number): BudgetGrant {
  return {
    maxTokens: 1_000_000,
    providers: ['openai', 'anthropic'],
    models: ['gpt-4o', 'claude-opus-4-5'],
    maxDepth: 3,
    expiresAt: new Date(nowMs + HOUR_MS),
  };
}

describe('budget attestation', () => {
  it('mints a root token and verifies the chain', () => {
    const authority = genKey();
    const { token, delegatePrivateKey } = newRootBudgetToken(authority.privateKey, { grant: rootGrant(FIXED_NOW) });

    expect(delegatePrivateKey).toBeDefined();
    expect(token.blocks).toHaveLength(1);

    const grant = verifyChain(token, authority.publicKey, FIXED_NOW);
    expect(grant.maxTokens).toBe(1_000_000);
  });

  it('rejects verification against the wrong root key', () => {
    const authority = genKey();
    const wrong = genKey();
    const { token } = newRootBudgetToken(authority.privateKey, { grant: rootGrant(FIXED_NOW) });

    expect(() => verifyChain(token, wrong.publicKey, FIXED_NOW)).toThrow(/invalid signature/);
  });

  it('narrows correctly across a single-hop delegation', () => {
    const authority = genKey();
    const root = newRootBudgetToken(authority.privateKey, { grant: rootGrant(FIXED_NOW) });

    const delegated = attest(root.token, root.delegatePrivateKey!, {
      grant: {
        maxTokens: 10_000, // narrower
        providers: ['openai'],
        models: ['gpt-4o'],
        maxDepth: 1, // narrower (<= 3-1)
        expiresAt: new Date(FIXED_NOW + 30 * MINUTE_MS),
      },
    });

    expect(delegated.delegatePrivateKey).toBeDefined();
    expect(delegated.token.blocks).toHaveLength(2);

    const grant = verifyChain(delegated.token, authority.publicKey, FIXED_NOW);
    expect(grant.maxTokens).toBe(10_000); // effective grant is the narrowed leaf
  });

  it('rejects a delegation that widens maxTokens', () => {
    const authority = genKey();
    const root = newRootBudgetToken(authority.privateKey, { grant: rootGrant(FIXED_NOW) });

    expect(() =>
      attest(root.token, root.delegatePrivateKey!, {
        grant: {
          maxTokens: 2_000_000, // wider than parent's 1,000,000
          maxDepth: 1,
          expiresAt: new Date(FIXED_NOW + 30 * MINUTE_MS),
        },
      }),
    ).toThrow(/does not narrow/);
  });

  it('rejects a delegation that widens the provider list', () => {
    const authority = genKey();
    const root = newRootBudgetToken(authority.privateKey, { grant: rootGrant(FIXED_NOW) });

    expect(() =>
      attest(root.token, root.delegatePrivateKey!, {
        grant: {
          maxTokens: 100,
          providers: ['openai', 'google'], // "google" not in parent's [openai, anthropic]
          maxDepth: 1,
          expiresAt: new Date(FIXED_NOW + 30 * MINUTE_MS),
        },
      }),
    ).toThrow(/does not narrow/);
  });

  it('rejects an empty provider list against a restricted parent (widening to "any")', () => {
    const authority = genKey();
    const root = newRootBudgetToken(authority.privateKey, { grant: rootGrant(FIXED_NOW) });

    expect(() =>
      attest(root.token, root.delegatePrivateKey!, {
        grant: {
          maxTokens: 100,
          providers: [], // "any provider" is looser than the parent's specific list
          models: ['gpt-4o'],
          maxDepth: 1,
          expiresAt: new Date(FIXED_NOW + 30 * MINUTE_MS),
        },
      }),
    ).toThrow(/does not narrow/);
  });

  it('rejects a delegation with a later expiry', () => {
    const authority = genKey();
    const root = newRootBudgetToken(authority.privateKey, { grant: rootGrant(FIXED_NOW) });

    expect(() =>
      attest(root.token, root.delegatePrivateKey!, {
        grant: {
          maxTokens: 100,
          maxDepth: 1,
          expiresAt: new Date(FIXED_NOW + 2 * HOUR_MS), // later than parent's 1 hour
        },
      }),
    ).toThrow(/does not narrow/);
  });

  it('rejects delegation from a depth-exhausted token', () => {
    const authority = genKey();
    const root = newRootBudgetToken(authority.privateKey, {
      grant: {
        maxTokens: 1000,
        maxDepth: 0, // no further delegation allowed
        expiresAt: new Date(FIXED_NOW + HOUR_MS),
      },
    });

    expect(() =>
      attest(root.token, root.delegatePrivateKey!, {
        grant: {
          maxTokens: 100,
          maxDepth: 0,
          expiresAt: new Date(FIXED_NOW + 30 * MINUTE_MS),
        },
      }),
    ).toThrow(/does not narrow/);
  });

  it('rejects attest with a private key that is not the current holder', () => {
    const authority = genKey();
    const wrong = genKey();
    const root = newRootBudgetToken(authority.privateKey, { grant: rootGrant(FIXED_NOW) });

    expect(() =>
      attest(root.token, wrong.privateKey, {
        grant: {
          maxTokens: 100,
          maxDepth: 1,
          expiresAt: new Date(FIXED_NOW + 30 * MINUTE_MS),
        },
      }),
    ).toThrow(/does not match the token's current holder key/);
  });

  it('rejects an expired token', () => {
    const authority = genKey();
    const { token } = newRootBudgetToken(authority.privateKey, { grant: rootGrant(FIXED_NOW) });

    const future = FIXED_NOW + 2 * HOUR_MS;
    expect(() => verifyChain(token, authority.publicKey, future)).toThrow(/expired/);
  });

  // Reproduces a real gap: the signature commits to expiresAt truncated to
  // whole seconds (see formatExpiryCanonical/signingPayload), but the
  // expiry CHECK used to compare against the raw, untruncated millisecond
  // value. A grant expiring at T+999ms was signed as if it expired at T,
  // but verifyChain would still accept it up to 999ms past T — the
  // enforced statement was looser than the signed one.
  it('enforces the same truncated expiry it signed, not the raw sub-second value', () => {
    const authority = genKey();
    const base = FIXED_NOW;
    const grant = { ...rootGrant(base), expiresAt: new Date(base + 999) };
    const { token } = newRootBudgetToken(authority.privateKey, { grant });

    // 500ms past `base`: before the RAW expiry (base+999ms), so the old
    // buggy check would have accepted this — but it's already after the
    // TRUNCATED expiry the signature actually committed to.
    expect(() => verifyChain(token, authority.publicKey, base + 500)).toThrow(/expired/);

    // At exactly `base` (the truncated/signed instant itself), it must
    // still verify — not yet expired.
    expect(() => verifyChain(token, authority.publicKey, base)).not.toThrow();
  });

  it('signs and verifies a presentation with the correct holder', () => {
    const authority = genKey();
    // verifyPresentation defaults to real wall-clock time, so the grant must
    // be anchored to Date.now(), not a fixed historical date.
    const now = Date.now();
    const { token, delegatePrivateKey } = newRootBudgetToken(authority.privateKey, { grant: rootGrant(now) });

    const context = Buffer.from('request-nonce-abc123');
    const signature = sign(token, delegatePrivateKey!, context);

    const grant = verifyPresentation(token, authority.publicKey, context, signature);
    expect(grant.maxTokens).toBe(1_000_000);
  });

  it('sign refuses a private key that does not match the holder key', () => {
    const authority = genKey();
    const impostor = genKey();
    const { token } = newRootBudgetToken(authority.privateKey, { grant: rootGrant(FIXED_NOW) });

    // The impostor doesn't hold the token's delegate key, so sign itself
    // must refuse — this is the defensive check inside sign.
    expect(() => sign(token, impostor.privateKey, Buffer.from('request-nonce'))).toThrow(
      /does not match the token's current holder key/,
    );
  });

  it('rejects a signature replayed under a different context', () => {
    const authority = genKey();
    // Same real-clock consideration as the presentation test above.
    const now = Date.now();
    const { token, delegatePrivateKey } = newRootBudgetToken(authority.privateKey, { grant: rootGrant(now) });

    const signature = sign(token, delegatePrivateKey!, Buffer.from('original-context'));
    expect(() =>
      verifyPresentation(token, authority.publicKey, Buffer.from('different-context'), signature),
    ).toThrow(/proof-of-possession signature invalid/);
  });

  it('issues to an explicit delegate public key without generating a keypair', () => {
    const authority = genKey();
    const explicitDelegate = genKey();

    const { token, delegatePrivateKey } = newRootBudgetToken(authority.privateKey, {
      grant: rootGrant(FIXED_NOW),
      delegatePublicKey: explicitDelegate.publicKey,
    });

    // No private key should be generated when delegatePublicKey was supplied.
    expect(delegatePrivateKey).toBeUndefined();

    // The explicit delegate's own private key must work.
    expect(() => sign(token, explicitDelegate.privateKey, Buffer.from('ctx'))).not.toThrow();
  });

  it('marshal round-trip preserves verification (nil-vs-empty lists)', () => {
    const authority = genKey();

    // Unrestricted root (omitted providers/models) so the child can validly
    // leave them out too — this exercises nil-vs-empty-list signing
    // determinism: the root's omitted lists are normalized when signed, then
    // marshal/parseBudgetToken round-trips them through JSON as [], and
    // verification must still recompute an identical signing payload from
    // that reconstructed grant.
    const root = newRootBudgetToken(authority.privateKey, {
      grant: {
        maxTokens: 1_000_000,
        maxDepth: 3,
        expiresAt: new Date(FIXED_NOW + HOUR_MS),
      },
    });

    const delegated = attest(root.token, root.delegatePrivateKey!, {
      grant: {
        maxTokens: 500,
        maxDepth: 0,
        expiresAt: new Date(FIXED_NOW + 10 * MINUTE_MS),
        // providers/models deliberately omitted here too.
      },
    });

    const encoded = delegated.token.marshal();
    const parsed = parseBudgetToken(encoded);

    const grant = verifyChain(parsed, authority.publicKey, FIXED_NOW);
    expect(grant.maxTokens).toBe(500);
  });

  it('marshal round-trip preserves a restricted provider list', () => {
    const authority = genKey();
    const root = newRootBudgetToken(authority.privateKey, { grant: rootGrant(FIXED_NOW) });

    const delegated = attest(root.token, root.delegatePrivateKey!, {
      grant: {
        maxTokens: 500,
        providers: ['openai'], // narrowed subset of the root's [openai, anthropic]
        models: ['gpt-4o'],
        maxDepth: 0,
        expiresAt: new Date(FIXED_NOW + 10 * MINUTE_MS),
      },
    });

    const parsed = parseBudgetToken(delegated.token.marshal());
    const grant = verifyChain(parsed, authority.publicKey, FIXED_NOW);
    expect(grant.providers).toEqual(['openai']);
  });

  it('a round-tripped token still supports proof-of-possession presentation', () => {
    const authority = genKey();
    const now = Date.now(); // presentation path checks real wall-clock time
    const { token, delegatePrivateKey } = newRootBudgetToken(authority.privateKey, { grant: rootGrant(now) });

    const parsed = parseBudgetToken(token.marshal());
    const context = Buffer.from('post-transport-nonce');
    const signature = sign(parsed, delegatePrivateKey!, context);

    const grant = verifyPresentation(parsed, authority.publicKey, context, signature);
    expect(grant.maxTokens).toBe(1_000_000);
  });

  it('validate rejects a grant with no expiry', () => {
    const authority = genKey();
    expect(() =>
      newRootBudgetToken(authority.privateKey, {
        grant: { maxTokens: 100, maxDepth: 0 } as unknown as BudgetGrant,
      }),
    ).toThrow(/expiresAt must be set/);
  });

  it('validate rejects negative maxDepth', () => {
    const authority = genKey();
    expect(() =>
      newRootBudgetToken(authority.privateKey, {
        grant: {
          maxTokens: 100,
          maxDepth: -1,
          expiresAt: new Date(Date.now() + HOUR_MS),
        },
      }),
    ).toThrow(/maxDepth must be >= 0/);
  });

  it('isSubsetOf table', () => {
    const cases: Array<{ name: string; child: string[] | null; parent: string[]; want: boolean }> = [
      { name: 'exact match', child: ['openai'], parent: ['openai'], want: true },
      { name: 'proper subset', child: ['openai'], parent: ['openai', 'anthropic'], want: true },
      { name: 'not a subset', child: ['google'], parent: ['openai', 'anthropic'], want: false },
      { name: 'empty child against restricted parent is a widening', child: null, parent: ['openai'], want: false },
      { name: 'empty parent handled by caller, not this helper', child: ['openai'], parent: [], want: false },
    ];
    for (const tc of cases) {
      expect(isSubsetOf(tc.child, tc.parent), tc.name).toBe(tc.want);
    }
  });
});
