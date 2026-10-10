/**
 * Cost ledger math. Every billable event becomes one or more cost_ledger rows.
 * Rates live in the `rates` table (editable), never hard-coded — defaults here
 * mirror the seed and are used only when a rate row is missing.
 */

export type Rates = Record<string, number>;

export const DEFAULT_RATES: Rates = {
  vaani_per_minute_inr: 6.0,
  claude_in_per_mtok_usd: 2.0, // Sonnet 5.5 input $/1M
  claude_out_per_mtok_usd: 10.0, // Sonnet 5.5 output $/1M
  usd_inr_fx: 88.0,
  sms_per_message_inr: 0.2,
  telegram_per_message_inr: 0.0,
};

function rate(rates: Rates, key: string): number {
  return rates[key] ?? DEFAULT_RATES[key] ?? 0;
}

export interface CostRow {
  source: 'vaani_minutes' | 'claude_tokens_in' | 'claude_tokens_out' | 'sms' | 'telegram' | 'fixed';
  units: number;
  unit_label: string;
  unit_cost_inr: number;
  amount_inr: number;
  meta?: Record<string, unknown>;
}

/** Claude token cost → two rows (input, output), in INR. */
export function claudeCostRows(
  inputTokens: number,
  outputTokens: number,
  model: string,
  rates: Rates = DEFAULT_RATES,
): CostRow[] {
  const fx = rate(rates, 'usd_inr_fx');
  const inPerTokInr = (rate(rates, 'claude_in_per_mtok_usd') * fx) / 1_000_000;
  const outPerTokInr = (rate(rates, 'claude_out_per_mtok_usd') * fx) / 1_000_000;
  return [
    {
      source: 'claude_tokens_in',
      units: inputTokens,
      unit_label: 'tokens',
      unit_cost_inr: inPerTokInr,
      amount_inr: round4(inputTokens * inPerTokInr),
      meta: { model },
    },
    {
      source: 'claude_tokens_out',
      units: outputTokens,
      unit_label: 'tokens',
      unit_cost_inr: outPerTokInr,
      amount_inr: round4(outputTokens * outPerTokInr),
      meta: { model },
    },
  ];
}

/** Vaani minute cost → one row. */
export function vaaniCostRow(minutes: number, rates: Rates = DEFAULT_RATES): CostRow {
  const unit = rate(rates, 'vaani_per_minute_inr');
  return {
    source: 'vaani_minutes',
    units: minutes,
    unit_label: 'minutes',
    unit_cost_inr: unit,
    amount_inr: round4(minutes * unit),
  };
}

export function totalInr(rows: CostRow[]): number {
  return round4(rows.reduce((s, r) => s + r.amount_inr, 0));
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
