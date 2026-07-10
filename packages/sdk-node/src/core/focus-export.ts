/**
 * FOCUS export — spend data in the FinOps interchange shape.
 *
 * FOCUS (FinOps Open Cost and Usage Specification, focus.finops.org) is
 * the column contract enterprise cost tooling ingests. This export is
 * FOCUS-ALIGNED: core columns follow the spec (ConsumedQuantity/
 * ConsumedUnit are the spec's own home for token usage — FOCUS 1.2's
 * virtual-currency work uses GPT tokens as its worked example), and
 * RateGuard-specific detail rides in x_-prefixed columns, the spec's
 * sanctioned extension convention.
 *
 * Honest scope: costs here are RateGuard's pricing-table ESTIMATES of
 * LLM spend observed in-process, not a provider invoice. BilledCost is
 * deliberately 0 — RateGuard bills nothing; EffectiveCost carries the
 * estimate. Reconcile against provider billing for accounting truth.
 */

import type { SpendReceipt } from './spend-receipt.js';

export const FOCUS_HEADER = [
  'ChargePeriodStart', 'ChargePeriodEnd', 'ChargeCategory', 'ChargeDescription',
  'BilledCost', 'EffectiveCost', 'BillingCurrency',
  'ProviderName', 'ServiceName', 'ServiceCategory',
  'ResourceId', 'SkuId', 'ConsumedQuantity', 'ConsumedUnit',
  'x_rateguard_input_tokens', 'x_rateguard_output_tokens',
  'x_rateguard_policy_preset', 'x_rateguard_attestation_token_id',
  'x_rateguard_receipt_signature',
] as const;

/** One charge-period row; property order is the CSV column order. */
export interface FOCUSRow {
  chargePeriodStart: string;
  chargePeriodEnd: string;
  chargeCategory: string;
  chargeDescription: string;
  billedCost: number;
  effectiveCost: number;
  billingCurrency: string;
  providerName: string;
  serviceName: string;
  serviceCategory: string;
  resourceId: string;
  skuId: string;
  consumedQuantity: number;
  consumedUnit: string;
  xInputTokens: number;
  xOutputTokens: number;
  xPolicyPreset: string;
  xAttestationTokenId: string;
  xReceiptSignature: string;
}

function isoUTC(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Maps a spend receipt onto a FOCUS row. */
export function focusRowFromReceipt(r: SpendReceipt): FOCUSRow {
  const model = r.claims.model ?? '';
  const desc = model
    ? `LLM token usage (${model}) metered in-process by RateGuard`
    : 'LLM token usage metered in-process by RateGuard';
  return {
    chargePeriodStart: isoUTC(r.claims.windowStartUnix),
    chargePeriodEnd: isoUTC(r.claims.windowEndUnix),
    chargeCategory: 'Usage',
    chargeDescription: desc,
    billedCost: 0,
    effectiveCost: r.claims.estimatedCostMicroUSD / 1e6,
    billingCurrency: 'USD',
    providerName: r.claims.provider ?? '',
    serviceName: 'LLM Inference',
    serviceCategory: 'AI and Machine Learning',
    resourceId: r.claims.key,
    skuId: model,
    consumedQuantity: r.claims.totalTokens,
    consumedUnit: 'tokens',
    xInputTokens: r.claims.inputTokens,
    xOutputTokens: r.claims.outputTokens,
    xPolicyPreset: r.claims.policyPreset ?? '',
    xAttestationTokenId: r.claims.attestationTokenId ?? '',
    xReceiptSignature: r.signature.length > 0 ? r.signature.toString('base64') : '',
  };
}

/**
 * Minimal RFC-4180 escaping, matching Go's encoding/csv output for these
 * cells: quote only when the cell contains a comma, quote, or newline.
 */
function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.split('"').join('""')}"`;
  }
  return value;
}

/**
 * Formats numbers like Go's %g so all three SDKs emit identical cells
 * (0.645 → "0.645", 154500 → "154500", 0 → "0").
 */
function fmt(value: number): string {
  return String(value);
}

/** Renders header plus one line per row, \n-terminated (Go's csv default). */
export function writeFOCUSCSV(rows: FOCUSRow[]): string {
  const lines = [FOCUS_HEADER.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.chargePeriodStart, r.chargePeriodEnd, r.chargeCategory, r.chargeDescription,
        fmt(r.billedCost), fmt(r.effectiveCost), r.billingCurrency,
        r.providerName, r.serviceName, r.serviceCategory,
        r.resourceId, r.skuId, fmt(r.consumedQuantity), r.consumedUnit,
        String(r.xInputTokens), String(r.xOutputTokens),
        r.xPolicyPreset, r.xAttestationTokenId, r.xReceiptSignature,
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return lines.join('\n') + '\n';
}
