/**
 * Spend receipts + FOCUS export — mirrors Go's spend_receipt_test.go,
 * including the byte-exact conformance vectors against the Go reference.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { privateKeyFromRaw, publicKeyToRaw } from '../src/core/budget-attestation.js';
import { FOCUS_HEADER, focusRowFromReceipt, writeFOCUSCSV } from '../src/core/focus-export.js';
import {
  issueSpendReceipt,
  receiptSigningPayload,
  spendReceiptFromJSON,
  spendReceiptToJSON,
  verifySpendReceipt,
  type SpendReceiptClaims,
} from '../src/core/spend-receipt.js';
import { createPublicKey } from 'node:crypto';

const VECTORS_PATH = join(__dirname, '..', '..', '..', 'conformance', 'spend_receipt_vectors.json');

function testKey() {
  const seed = Buffer.from(Array.from({ length: 32 }, (_, i) => i));
  const priv = privateKeyFromRaw(seed);
  return { priv, pub: publicKeyToRaw(createPublicKey(priv)) };
}

function sampleClaims(): SpendReceiptClaims {
  return {
    key: 'tenant-a:agent-7',
    provider: 'openai',
    model: 'gpt-4o',
    windowStartUnix: 1_780_000_000,
    windowEndUnix: 1_780_003_600,
    inputTokens: 120_000,
    outputTokens: 34_500,
    totalTokens: 154_500,
    estimatedCostMicroUSD: 645_000,
    policyPreset: 'agent-orchestrator',
    attestationTokenId: 'att-9f2c',
  };
}

describe('spend receipts', () => {
  it('issue/verify roundtrip, including JSON transport', () => {
    const { priv, pub } = testKey();
    const r = issueSpendReceipt(priv, sampleClaims());
    verifySpendReceipt(pub, r);

    const back = spendReceiptFromJSON(JSON.parse(JSON.stringify(spendReceiptToJSON(r))));
    verifySpendReceipt(pub, back);
  });

  it('detects tampering', () => {
    const { priv, pub } = testKey();
    const r = issueSpendReceipt(priv, sampleClaims());

    expect(() =>
      verifySpendReceipt(pub, { ...r, claims: { ...r.claims, totalTokens: 1 } }),
    ).toThrow(/verification failed/);
    expect(() => verifySpendReceipt(pub, { ...r, issuedAtUnix: r.issuedAtUnix + 1 })).toThrow(
      /verification failed/,
    );

    const other = publicKeyToRaw(createPublicKey(privateKeyFromRaw(Buffer.alloc(32, 7))));
    expect(() => verifySpendReceipt(other, r)).toThrow(/trusted issuer/);

    // Integrity-only mode: untampered passes, tampered still fails.
    verifySpendReceipt(null, r);
    expect(() =>
      verifySpendReceipt(null, { ...r, claims: { ...r.claims, key: 'someone-else' } }),
    ).toThrow(/verification failed/);
  });

  it('validates claims', () => {
    const { priv } = testKey();
    expect(() => issueSpendReceipt(priv, { ...sampleClaims(), key: '' })).toThrow(/need a key/);
    expect(() =>
      issueSpendReceipt(priv, { ...sampleClaims(), windowEndUnix: sampleClaims().windowStartUnix }),
    ).toThrow(/window end/);
    expect(() => issueSpendReceipt(priv, { ...sampleClaims(), estimatedCostMicroUSD: -1 })).toThrow(
      /non-negative/,
    );
  });

  it('matches the Go reference vectors byte-for-byte', () => {
    const v = JSON.parse(readFileSync(VECTORS_PATH, 'utf8')) as {
      seed_hex: string;
      issued_at_unix: number;
      claims: Record<string, unknown>;
      payload: string;
      signature_hex: string;
    };
    const priv = privateKeyFromRaw(Buffer.from(v.seed_hex, 'hex'));
    const pub = publicKeyToRaw(createPublicKey(priv));
    const claims: SpendReceiptClaims = {
      key: String(v.claims['key']),
      provider: String(v.claims['provider'] ?? ''),
      model: String(v.claims['model'] ?? ''),
      windowStartUnix: Number(v.claims['window_start_unix']),
      windowEndUnix: Number(v.claims['window_end_unix']),
      inputTokens: Number(v.claims['input_tokens']),
      outputTokens: Number(v.claims['output_tokens']),
      totalTokens: Number(v.claims['total_tokens']),
      estimatedCostMicroUSD: Number(v.claims['estimated_cost_micro_usd']),
      policyPreset: String(v.claims['policy_preset'] ?? ''),
      attestationTokenId: String(v.claims['attestation_token_id'] ?? ''),
    };

    const payload = receiptSigningPayload(claims, v.issued_at_unix, pub);
    expect(payload.toString('utf8')).toBe(v.payload);

    const r = issueSpendReceipt(priv, claims, v.issued_at_unix);
    expect(r.signature.toString('hex')).toBe(v.signature_hex);
    verifySpendReceipt(pub, r);
  });
});

describe('FOCUS export', () => {
  it('renders spec-shaped CSV with exact cells', () => {
    const { priv } = testKey();
    const r = issueSpendReceipt(priv, sampleClaims(), 1_780_003_700);
    const csv = writeFOCUSCSV([focusRowFromReceipt(r)]);

    const [headerLine, rowLine, trailing] = csv.split('\n');
    expect(trailing).toBe(''); // \n-terminated like Go's encoding/csv
    expect(headerLine).toBe(FOCUS_HEADER.join(','));

    const header = headerLine!.split(',');
    const row = rowLine!.split(','); // no sample cell needs quoting
    const cell = (name: string) => row[header.indexOf(name)];

    expect(cell('EffectiveCost')).toBe('0.645');
    expect(cell('BilledCost')).toBe('0');
    expect(cell('ConsumedQuantity')).toBe('154500');
    expect(cell('ConsumedUnit')).toBe('tokens');
    expect(cell('ChargePeriodStart')).toBe('2026-05-28T20:26:40Z');
    expect(cell('ServiceCategory')).toBe('AI and Machine Learning');
    expect(cell('x_rateguard_input_tokens')).toBe('120000');
    expect(cell('x_rateguard_receipt_signature')).not.toBe('');
  });
});
