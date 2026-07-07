/**
 * Budget attestation — Ed25519 delegation chains.
 * Node port of Go's budget_attestation.go (packages/sdk-go).
 *
 * Multi-agent systems delegate: an orchestrator hands a sub-task to a
 * tool-calling agent, which may hand a further sub-task to another agent,
 * possibly across process or trust boundaries. Today that delegation carries
 * no enforceable budget — the sub-agent either trusts the orchestrator's
 * word about its spending limit, or the orchestrator has to stay in the loop
 * for every call. Budget attestation closes that gap with a cryptographic
 * token, in the shape the IETF Agent Identity Protocol draft
 * (draft-prakash-aip, draft-singla-agent-identity-protocol) is standardizing
 * around: a chain of Ed25519-signed blocks where each hop can only NARROW
 * the grant it received — less budget, fewer providers, less delegation
 * depth, an earlier expiry — never widen it.
 *
 * This is RateGuard's own extension, not a claim of AIP compliance — the
 * IETF spec is still draft-level. v0.1 scope: single-hop delegation,
 * verified end-to-end, is the primary target; the chain design supports
 * multiple hops because attenuation only works if it composes, but longer
 * chains are unproven in production here and should be adopted cautiously.
 *
 * Trust model: verifiers must already know the ROOT authority's Ed25519
 * public key out-of-band (the same way a TLS client trusts a CA root
 * certificate) — RateGuard does not provide key distribution or a registry.
 * Everything after the root is self-contained: each block carries the next
 * hop's public key, so verification never needs to phone home.
 *
 * A token is data — anyone who intercepts a serialized token can read its
 * terms, but using it to authorize a call requires signing a
 * verifier-supplied context with the current holder's PRIVATE key (see
 * sign/verifyPresentation). Chain-only verification (verifyChain) proves the
 * terms are well-formed and unexpired; it does not prove the presenter is
 * the legitimate holder.
 *
 * Zero new dependency: keys are node:crypto KeyObjects
 * (crypto.generateKeyPairSync('ed25519')), and signing/verifying pass `null`
 * as the algorithm — correct for Ed25519, where the curve fixes the hash.
 */

import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
  type KeyObject,
} from 'node:crypto';

/** The resource constraint one link of a budget token carries. */
export interface BudgetGrant {
  /**
   * Token budget available under this grant. <= 0 means unlimited — but a
   * child grant may only be unlimited if its parent is also unlimited; once
   * a chain sets a limit, no descendant can remove it.
   */
  maxTokens: number;
  /**
   * Restricts which LLM providers this grant covers. Empty/omitted means any
   * provider. A child may narrow an unrestricted parent to a specific list,
   * but may never widen a restricted parent's list.
   */
  providers?: string[];
  /** Restricts which models this grant covers, same rules as providers. */
  models?: string[];
  /**
   * How many further delegations are allowed starting from this block (each
   * delegation consumes exactly one unit). 0 means this holder may use the
   * grant but may not delegate it further.
   */
  maxDepth: number;
  /**
   * Mandatory — an unexpiring budget token is a standing liability. A
   * child's expiry must be at or before its parent's.
   */
  expiresAt: Date;
}

/** Throws when a grant is structurally invalid. Mirrors Go's grant.validate(). */
export function validateBudgetGrant(grant: BudgetGrant): void {
  if (!Number.isInteger(grant.maxDepth) || grant.maxDepth < 0) {
    throw new Error('rateguard: budget grant maxDepth must be >= 0');
  }
  if (!(grant.expiresAt instanceof Date) || Number.isNaN(grant.expiresAt.getTime())) {
    throw new Error('rateguard: budget grant expiresAt must be set');
  }
}

/**
 * Reports whether `grant` is a valid attenuation of `parent`: every field
 * equal to or more restrictive, never looser.
 */
export function budgetGrantNarrows(grant: BudgetGrant, parent: BudgetGrant): boolean {
  if (parent.maxTokens > 0) {
    if (grant.maxTokens <= 0 || grant.maxTokens > parent.maxTokens) {
      return false;
    }
  }
  const parentProviders = parent.providers ?? [];
  if (parentProviders.length > 0 && !isSubsetOf(grant.providers ?? [], parentProviders)) {
    return false;
  }
  const parentModels = parent.models ?? [];
  if (parentModels.length > 0 && !isSubsetOf(grant.models ?? [], parentModels)) {
    return false;
  }
  if (grant.maxDepth > parent.maxDepth - 1) {
    return false;
  }
  if (grant.expiresAt.getTime() > parent.expiresAt.getTime()) {
    return false;
  }
  return true;
}

/**
 * Reports whether every entry in child appears in parent. An empty child
 * against a restricted (non-empty) parent is a widening — "any provider" is
 * looser than a specific list — so it is rejected.
 */
export function isSubsetOf(child: readonly string[] | undefined | null, parent: readonly string[]): boolean {
  if (!child || child.length === 0) {
    return false;
  }
  const allowed = new Set(parent);
  return child.every((entry) => allowed.has(entry));
}

// ── Key plumbing ──
// Public keys travel as raw 32-byte Ed25519 points (base64 on the wire,
// matching Go's ed25519.PublicKey bytes); in-process they are KeyObjects.
// JWK is the stdlib bridge between the two representations.

function rawPublicKeyBytes(publicKey: KeyObject): Buffer {
  const jwk = publicKey.export({ format: 'jwk' }) as { kty?: string; crv?: string; x?: string };
  if (jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || !jwk.x) {
    throw new Error('rateguard: budget attestation requires an Ed25519 key');
  }
  return Buffer.from(jwk.x, 'base64url');
}

function publicKeyFromRaw(raw: Buffer): KeyObject {
  return createPublicKey({
    key: { kty: 'OKP', crv: 'Ed25519', x: raw.toString('base64url') },
    format: 'jwk',
  });
}

function samePublicKey(a: KeyObject, b: KeyObject): boolean {
  return rawPublicKeyBytes(a).equals(rawPublicKeyBytes(b));
}

// The fixed 16-byte PKCS8 DER prefix for an Ed25519 private key (version +
// AlgorithmIdentifier + OCTET STRING wrapper), followed by the 32-byte seed —
// RFC 8410's encoding is constant apart from the seed itself, so this avoids
// needing the public key just to import a raw private key (unlike the JWK
// route, which requires both `x` and `d`).
const ED25519_PKCS8_DER_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

/**
 * Reconstructs an Ed25519 private KeyObject from raw bytes. Accepts either a
 * bare 32-byte seed or Go's 64-byte ed25519.PrivateKey convention (seed +
 * public key concatenated) — only the seed (first 32 bytes) is used.
 * Exported for MCP tool handlers, which receive keys as base64 strings over
 * the wire, not KeyObjects.
 */
export function privateKeyFromRaw(raw: Buffer): KeyObject {
  if (raw.length !== 32 && raw.length !== 64) {
    throw new Error('rateguard: budget attestation requires a 32-byte seed or 64-byte Ed25519 private key');
  }
  const seed = raw.subarray(0, 32);
  return createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_DER_PREFIX, seed]),
    format: 'der',
    type: 'pkcs8',
  });
}

/**
 * Encodes an Ed25519 private KeyObject as Go's 64-byte ed25519.PrivateKey
 * convention (seed + public key concatenated) — the interoperable wire
 * format, so a key minted by one language's MCP tool works when handed to
 * another's.
 */
export function privateKeyToRaw(key: KeyObject): Buffer {
  const jwk = key.export({ format: 'jwk' }) as { kty?: string; crv?: string; d?: string };
  if (jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || !jwk.d) {
    throw new Error('rateguard: budget attestation requires an Ed25519 private key');
  }
  const seed = Buffer.from(jwk.d, 'base64url');
  const pub = rawPublicKeyBytes(createPublicKey(key));
  return Buffer.concat([seed, pub]);
}

/** Reconstructs an Ed25519 public KeyObject from raw 32-byte point bytes. Exported for MCP tool handlers. */
export function publicKeyFromRawBytes(raw: Buffer): KeyObject {
  return publicKeyFromRaw(raw);
}

/** Encodes an Ed25519 public KeyObject as raw 32-byte point bytes. Exported for MCP tool handlers. */
export function publicKeyToRaw(key: KeyObject): Buffer {
  return rawPublicKeyBytes(key);
}

/** One link of a BudgetToken's chain. */
export interface BudgetBlock {
  readonly grant: BudgetGrant;
  /** Holder of this block onward. */
  readonly delegatePublicKey: KeyObject;
  /**
   * Signature over signingPayload(grant, delegatePublicKey), made by the
   * previous holder's private key (or the root authority key for block 0).
   */
  readonly signature: Buffer;
}

/** A chain of budget delegations, each narrower than the last. */
export class BudgetToken {
  constructor(readonly blocks: readonly BudgetBlock[]) {}

  /**
   * Encodes the token as compact JSON text — the string-safe form for MCP
   * tool args, HTTP headers, and inter-process handoffs. Round-trips through
   * the same canonical field set signingPayload uses, so a verified token
   * stays verifiable after transport.
   */
  marshal(): string {
    const wire = this.blocks.map((block) => ({
      grant: {
        max_tokens: block.grant.maxTokens,
        providers: block.grant.providers ?? [],
        models: block.grant.models ?? [],
        max_depth: block.grant.maxDepth,
        expires_at: new Date(block.grant.expiresAt.getTime()).toISOString(),
      },
      delegate_public_key: rawPublicKeyBytes(block.delegatePublicKey).toString('base64'),
      signature: block.signature.toString('base64'),
    }));
    return JSON.stringify(wire);
  }
}

/**
 * Formats an instant as RFC 3339 UTC truncated to whole seconds — no
 * fractional component, ever (e.g. "2026-08-01T00:00:00Z"). Used instead of
 * Date#toISOString (which always emits fixed 3-digit milliseconds) so that
 * Go, Node, and Python compute byte-identical signing payloads for the same
 * instant: Go's time.Time JSON marshaling trims trailing zero fractional
 * digits (0.5s -> ".5"), Python's isoformat emits fixed 6-digit
 * microseconds, and Node's toISOString emits fixed 3-digit milliseconds —
 * three different byte strings for the same moment, which would break
 * cross-language Ed25519 verification.
 */
function formatExpiryCanonical(date: Date): string {
  const truncated = new Date(Math.floor(date.getTime() / 1000) * 1000);
  return truncated.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * The canonical, deterministic byte encoding a block's signature commits to.
 * Lists are normalized (undefined == empty) and the expiry is normalized to
 * a whole-second ISO 8601 UTC instant, so the same logical grant always
 * signs and verifies identically regardless of how it was constructed or
 * how it round-tripped through marshal/parseBudgetToken.
 */
export function signingPayload(grant: BudgetGrant, delegatePublicKey: KeyObject): Buffer {
  const payload = {
    max_tokens: grant.maxTokens,
    providers: grant.providers ?? [],
    models: grant.models ?? [],
    max_depth: grant.maxDepth,
    expires_at: formatExpiryCanonical(grant.expiresAt),
    delegate_public_key: rawPublicKeyBytes(delegatePublicKey).toString('base64'),
  };
  return Buffer.from(JSON.stringify(payload), 'utf8');
}

function resolveDelegateKey(existing?: KeyObject): { publicKey: KeyObject; privateKey?: KeyObject } {
  if (existing) {
    return { publicKey: existing }; // caller already holds the matching private key
  }
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return { publicKey, privateKey };
}

/** Configures a new root grant or a narrowed delegation. */
export interface AttestOptions {
  grant: BudgetGrant;
  /**
   * If set, the token is issued to this externally-generated public key —
   * the delegate generated its own keypair and shared only the public half,
   * so its private key never transits through the delegator. This is the
   * recommended pattern for multi-hop chains. If omitted, a fresh keypair is
   * generated and the private key is returned to the caller — the
   * convenience path for a delegator bootstrapping a sub-agent it is about
   * to spawn itself.
   */
  delegatePublicKey?: KeyObject;
}

/** Result of newRootBudgetToken/attest. */
export interface AttestResult {
  token: BudgetToken;
  /** Present only when opts.delegatePublicKey was omitted and a keypair was generated. */
  delegatePrivateKey?: KeyObject;
}

/**
 * Mints the genesis block of a budget token, signed by authorityPrivateKey —
 * the long-term key every verifier must already trust out-of-band as the
 * root of authority. Returns the token and, when opts.delegatePublicKey is
 * omitted, the freshly generated delegate private key.
 */
export function newRootBudgetToken(authorityPrivateKey: KeyObject, opts: AttestOptions): AttestResult {
  validateBudgetGrant(opts.grant);
  const delegate = resolveDelegateKey(opts.delegatePublicKey);
  const signature = cryptoSign(null, signingPayload(opts.grant, delegate.publicKey), authorityPrivateKey);
  const token = new BudgetToken([
    { grant: opts.grant, delegatePublicKey: delegate.publicKey, signature },
  ]);
  return delegate.privateKey ? { token, delegatePrivateKey: delegate.privateKey } : { token };
}

/**
 * Extends token with a new, narrower delegation. parentPrivateKey must
 * correspond to the token's current last-block delegatePublicKey — proof
 * that the caller is the legitimate current holder, not just anyone who saw
 * the token. Returns the extended token and, when opts.delegatePublicKey is
 * omitted, the freshly generated next-holder private key.
 */
export function attest(token: BudgetToken, parentPrivateKey: KeyObject, opts: AttestOptions): AttestResult {
  if (!token || token.blocks.length === 0) {
    throw new Error('rateguard: cannot attest from an empty token');
  }
  const last = token.blocks[token.blocks.length - 1]!; // non-empty guarded above
  if (!samePublicKey(createPublicKey(parentPrivateKey), last.delegatePublicKey)) {
    throw new Error("rateguard: parent private key does not match the token's current holder key");
  }
  validateBudgetGrant(opts.grant);
  if (!budgetGrantNarrows(opts.grant, last.grant)) {
    throw new Error('rateguard: new grant does not narrow the parent grant');
  }

  const delegate = resolveDelegateKey(opts.delegatePublicKey);
  const signature = cryptoSign(null, signingPayload(opts.grant, delegate.publicKey), parentPrivateKey);
  const extended = new BudgetToken([
    ...token.blocks,
    { grant: opts.grant, delegatePublicKey: delegate.publicKey, signature },
  ]);
  return delegate.privateKey ? { token: extended, delegatePrivateKey: delegate.privateKey } : { token: extended };
}

/**
 * Validates a token's signature chain against rootPublicKey and checks every
 * block narrows its parent and none has expired. Returns the effective grant
 * (the final, narrowest block) on success; throws on any violation.
 *
 * This does NOT prove the presenter legitimately holds the token — a token
 * is data, readable by anyone who intercepts it. Use verifyPresentation for
 * an authorization decision.
 *
 * `nowMs` defaults to real wall-clock time; injectable for deterministic
 * tests (mirrors Go's internal verifyChainAt).
 */
export function verifyChain(token: BudgetToken, rootPublicKey: KeyObject, nowMs: number = Date.now()): BudgetGrant {
  if (!token || token.blocks.length === 0) {
    throw new Error('rateguard: empty budget token');
  }

  let signer = rootPublicKey;
  let effective = token.blocks[0]!.grant; // non-empty guarded above
  for (const [i, block] of token.blocks.entries()) {
    if (!cryptoVerify(null, signingPayload(block.grant, block.delegatePublicKey), signer, block.signature)) {
      throw new Error(`rateguard: budget token block ${i}: invalid signature`);
    }
    if (i > 0 && !budgetGrantNarrows(block.grant, effective)) {
      throw new Error(`rateguard: budget token block ${i}: grant does not narrow its parent`);
    }
    // Check against the SAME truncated-to-whole-seconds instant the
    // signature committed to (see formatExpiryCanonical/signingPayload),
    // not the raw expiresAt — otherwise a holder could edit the token's
    // sub-second expiry digits (which the signature never covered) to
    // stretch validity by up to 1s beyond what was actually signed.
    const truncatedExpiryMs = Math.floor(block.grant.expiresAt.getTime() / 1000) * 1000;
    if (nowMs > truncatedExpiryMs) {
      throw new Error(`rateguard: budget token block ${i}: expired at ${block.grant.expiresAt.toISOString()}`);
    }
    effective = block.grant;
    signer = block.delegatePublicKey;
  }
  return effective;
}

/**
 * Produces a proof-of-possession signature over context using
 * holderPrivateKey. context is typically a verifier-supplied nonce or a
 * digest of the request being authorized — signing it binds this specific
 * use to this specific holder, so a captured token alone cannot be replayed
 * against a different challenge.
 */
export function sign(token: BudgetToken, holderPrivateKey: KeyObject, context: Buffer | Uint8Array): Buffer {
  if (!token || token.blocks.length === 0) {
    throw new Error('rateguard: cannot sign with an empty token');
  }
  const last = token.blocks[token.blocks.length - 1]!; // non-empty guarded above
  if (!samePublicKey(createPublicKey(holderPrivateKey), last.delegatePublicKey)) {
    throw new Error("rateguard: private key does not match the token's current holder key");
  }
  return cryptoSign(null, context, holderPrivateKey);
}

/**
 * Performs a full authorization check: the chain must be valid (see
 * verifyChain) AND signature must be a valid proof-of-possession over
 * context, made by the token's current holder key. This is the check a
 * receiving agent or MCP tool should run before honoring a budget token.
 */
export function verifyPresentation(
  token: BudgetToken,
  rootPublicKey: KeyObject,
  context: Buffer | Uint8Array,
  signature: Buffer | Uint8Array,
  nowMs: number = Date.now(),
): BudgetGrant {
  const grant = verifyChain(token, rootPublicKey, nowMs);
  const last = token.blocks[token.blocks.length - 1]!; // verifyChain rejected an empty token
  if (!cryptoVerify(null, context, last.delegatePublicKey, signature)) {
    throw new Error('rateguard: proof-of-possession signature invalid');
  }
  return grant;
}

/** Decodes a token previously produced by BudgetToken.marshal(). */
export function parseBudgetToken(text: string): BudgetToken {
  let wire: unknown;
  try {
    wire = JSON.parse(text);
  } catch (error) {
    throw new Error(`rateguard: parse budget token: ${(error as Error).message}`);
  }
  if (!Array.isArray(wire)) {
    throw new Error('rateguard: parse budget token: expected a JSON array of blocks');
  }

  const blocks = wire.map((entry, i): BudgetBlock => {
    const block = entry as {
      grant?: {
        max_tokens?: unknown;
        providers?: unknown;
        models?: unknown;
        max_depth?: unknown;
        expires_at?: unknown;
      };
      delegate_public_key?: unknown;
      signature?: unknown;
    };
    if (!block || typeof block !== 'object' || !block.grant || typeof block.grant !== 'object') {
      throw new Error(`rateguard: parse budget token block ${i}: missing grant`);
    }
    if (typeof block.delegate_public_key !== 'string' || typeof block.signature !== 'string') {
      throw new Error(`rateguard: parse budget token block ${i}: missing delegate key or signature`);
    }

    const expiresAt = new Date(String(block.grant.expires_at ?? ''));
    if (Number.isNaN(expiresAt.getTime())) {
      throw new Error(`rateguard: parse budget token block ${i}: invalid expires_at`);
    }

    let delegatePublicKey: KeyObject;
    try {
      delegatePublicKey = publicKeyFromRaw(Buffer.from(block.delegate_public_key, 'base64'));
    } catch {
      throw new Error(`rateguard: parse budget token block ${i}: invalid delegate key`);
    }

    return {
      grant: {
        maxTokens: typeof block.grant.max_tokens === 'number' ? block.grant.max_tokens : 0,
        providers: Array.isArray(block.grant.providers) ? block.grant.providers.map(String) : [],
        models: Array.isArray(block.grant.models) ? block.grant.models.map(String) : [],
        maxDepth: typeof block.grant.max_depth === 'number' ? block.grant.max_depth : 0,
        expiresAt,
      },
      delegatePublicKey,
      signature: Buffer.from(block.signature, 'base64'),
    };
  });

  return new BudgetToken(blocks);
}
