/**
 * Spend Receipts — signed proof of what was actually spent.
 *
 * Budget attestation answers "was this agent AUTHORIZED to spend?"; a
 * spend receipt answers the other half: "what DID it spend?" — an
 * Ed25519-signed, offline-verifiable statement that a key consumed N
 * tokens at an estimated cost over a window. Together: grant → spend →
 * proof. Binding a receipt to the attestation chain that authorized the
 * spend is the attestationTokenId field (groundwork — full chain binding
 * lands with attestation v2).
 *
 * Receipts are caller-fed primitives: the caller supplies the claims
 * (from its own metering) and a signing key it controls. RateGuard holds
 * no signing keys.
 *
 * Cross-language discipline (the budget-attestation lesson): the signing
 * payload contains ONLY integers and strings — unix seconds for time,
 * integer micro-USD for money. conformance/spend_receipt_vectors.json
 * pins payload and signature byte-for-byte against the Go reference.
 */

import { createPublicKey, sign as cryptoSign, verify as cryptoVerify, type KeyObject } from 'node:crypto';

import { publicKeyFromRawBytes, publicKeyToRaw } from './budget-attestation.js';

const RECEIPT_VERSION = 'rateguard-spend-receipt/1';

/** The statement a receipt signs. Window bounds are unix seconds UTC: [start, end). */
export interface SpendReceiptClaims {
  /** The budget/limiter key the spend was accounted under. */
  key: string;
  /** Provider and model scope the claim; empty means an aggregate. */
  provider?: string;
  model?: string;
  windowStartUnix: number;
  windowEndUnix: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /**
   * Integer micro-USD (1 USD = 1_000_000). A pricing-table ESTIMATE, not
   * a provider invoice — reconcile against billing for accounting truth.
   */
  estimatedCostMicroUSD: number;
  policyPreset?: string;
  /** Optionally binds this receipt to the budget attestation token that authorized the spend. */
  attestationTokenId?: string;
}

/** A signed SpendReceiptClaims. issuerPublicKey is raw 32 bytes. */
export interface SpendReceipt {
  claims: SpendReceiptClaims;
  issuedAtUnix: number;
  issuerPublicKey: Buffer;
  signature: Buffer;
}

function validateClaims(c: SpendReceiptClaims): void {
  if (!c.key) {
    throw new Error('rateguard: receipt claims need a key');
  }
  if (!(c.windowEndUnix > c.windowStartUnix)) {
    throw new Error(
      `rateguard: receipt window end (${c.windowEndUnix}) must be after start (${c.windowStartUnix})`,
    );
  }
  for (const v of [c.inputTokens, c.outputTokens, c.totalTokens, c.estimatedCostMicroUSD]) {
    if (!Number.isInteger(v) || v < 0) {
      throw new Error('rateguard: receipt token/cost claims must be non-negative integers');
    }
  }
}

/**
 * Canonical signing bytes. Key order and compact JSON MUST match Go's
 * json.Marshal of its fixed-field struct byte-for-byte (asserted by the
 * conformance vectors) — JSON.stringify preserves insertion order for
 * these string keys, which is the whole trick.
 */
export function receiptSigningPayload(
  claims: SpendReceiptClaims,
  issuedAtUnix: number,
  issuerPublicRaw: Buffer,
): Buffer {
  const payload = {
    v: RECEIPT_VERSION,
    key: claims.key,
    provider: claims.provider ?? '',
    model: claims.model ?? '',
    window_start_unix: claims.windowStartUnix,
    window_end_unix: claims.windowEndUnix,
    input_tokens: claims.inputTokens,
    output_tokens: claims.outputTokens,
    total_tokens: claims.totalTokens,
    estimated_cost_micro_usd: claims.estimatedCostMicroUSD,
    policy_preset: claims.policyPreset ?? '',
    attestation_token_id: claims.attestationTokenId ?? '',
    issued_at_unix: issuedAtUnix,
    issuer_public_key: issuerPublicRaw.toString('base64'),
  };
  return Buffer.from(JSON.stringify(payload), 'utf8');
}

/**
 * Sign claims with the issuer's key. issuedAtUnix defaults to now; pass
 * it explicitly for deterministic tests and conformance vectors.
 */
export function issueSpendReceipt(
  issuerPrivateKey: KeyObject,
  claims: SpendReceiptClaims,
  issuedAtUnix?: number,
): SpendReceipt {
  validateClaims(claims);
  const issued = issuedAtUnix ?? Math.floor(Date.now() / 1000);
  const pub = publicKeyToRaw(createPublicKey(issuerPrivateKey));
  const payload = receiptSigningPayload(claims, issued, pub);
  return {
    claims,
    issuedAtUnix: issued,
    issuerPublicKey: pub,
    signature: cryptoSign(null, payload, issuerPrivateKey),
  };
}

/**
 * Check the receipt's signature and claim sanity. trustedIssuerRaw pins
 * the raw 32-byte public key the caller trusts; null skips pinning and
 * proves only integrity under the EMBEDDED key — enough for tamper
 * detection, NOT authenticity. Throws on any failure.
 */
export function verifySpendReceipt(trustedIssuerRaw: Buffer | null, receipt: SpendReceipt): void {
  if (receipt.issuerPublicKey.length !== 32) {
    throw new Error('rateguard: receipt issuer key must be 32 bytes');
  }
  if (trustedIssuerRaw !== null && !trustedIssuerRaw.equals(receipt.issuerPublicKey)) {
    throw new Error('rateguard: receipt issuer key does not match the trusted issuer');
  }
  validateClaims(receipt.claims);
  const payload = receiptSigningPayload(receipt.claims, receipt.issuedAtUnix, receipt.issuerPublicKey);
  const ok = cryptoVerify(null, payload, publicKeyFromRawBytes(receipt.issuerPublicKey), receipt.signature);
  if (!ok) {
    throw new Error('rateguard: receipt signature verification failed');
  }
}

/** JSON-transport shape (bytes as base64), mirrors Go's json tags. */
export function spendReceiptToJSON(r: SpendReceipt): Record<string, unknown> {
  const claims: Record<string, unknown> = {
    key: r.claims.key,
    window_start_unix: r.claims.windowStartUnix,
    window_end_unix: r.claims.windowEndUnix,
    input_tokens: r.claims.inputTokens,
    output_tokens: r.claims.outputTokens,
    total_tokens: r.claims.totalTokens,
    estimated_cost_micro_usd: r.claims.estimatedCostMicroUSD,
  };
  if (r.claims.provider) claims['provider'] = r.claims.provider;
  if (r.claims.model) claims['model'] = r.claims.model;
  if (r.claims.policyPreset) claims['policy_preset'] = r.claims.policyPreset;
  if (r.claims.attestationTokenId) claims['attestation_token_id'] = r.claims.attestationTokenId;
  return {
    claims,
    issued_at_unix: r.issuedAtUnix,
    issuer_public_key: r.issuerPublicKey.toString('base64'),
    signature: r.signature.toString('base64'),
  };
}

/** Parse the JSON-transport shape back into a receipt. */
export function spendReceiptFromJSON(data: Record<string, unknown>): SpendReceipt {
  const c = data['claims'] as Record<string, unknown>;
  return {
    claims: {
      key: String(c['key']),
      provider: c['provider'] === undefined ? '' : String(c['provider']),
      model: c['model'] === undefined ? '' : String(c['model']),
      windowStartUnix: Number(c['window_start_unix']),
      windowEndUnix: Number(c['window_end_unix']),
      inputTokens: Number(c['input_tokens'] ?? 0),
      outputTokens: Number(c['output_tokens'] ?? 0),
      totalTokens: Number(c['total_tokens'] ?? 0),
      estimatedCostMicroUSD: Number(c['estimated_cost_micro_usd'] ?? 0),
      policyPreset: c['policy_preset'] === undefined ? '' : String(c['policy_preset']),
      attestationTokenId: c['attestation_token_id'] === undefined ? '' : String(c['attestation_token_id']),
    },
    issuedAtUnix: Number(data['issued_at_unix']),
    issuerPublicKey: Buffer.from(String(data['issuer_public_key']), 'base64'),
    signature: Buffer.from(String(data['signature']), 'base64'),
  };
}
