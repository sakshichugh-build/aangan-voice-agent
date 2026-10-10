/**
 * Pricing-leak guardrail. pricing.md is never given to the agent, but we still
 * scan every transcript for any number/range/per-sq-ft figure the agent might
 * have said. Regex is the fast first pass (P4); a Claude second check runs in the
 * pipeline for borderline cases.
 *
 * We scan ONLY the agent/front-desk turns — a caller stating their own budget
 * (e.g. "my budget is 1.5 lakh") is NOT a leak.
 */

export interface PricingLeak {
  snippet: string; // the matched line/phrase
  match: string; // the specific offending text
  reason: string;
}

const AGENT_LABELS = /^(front desk|agent|assistant|aangan|bot)\s*:/i;

// Price-ish patterns the AGENT must never produce.
const PATTERNS: { re: RegExp; reason: string }[] = [
  { re: /₹\s?\d/, reason: 'rupee amount' },
  { re: /\brs\.?\s?\d/i, reason: 'rupee amount (Rs)' },
  { re: /\binr\s?\d/i, reason: 'rupee amount (INR)' },
  { re: /\d[\d,]*\s*(?:lakh|lakhs|lac|lacs|crore|crores|k\b)/i, reason: 'amount in lakh/crore/k' },
  { re: /\d[\d,]*\s*(?:per|\/)\s*(?:sq\.?\s?ft|square\s?f(?:ee|oo)?t|sqft)/i, reason: 'per-sq-ft figure' },
  { re: /(?:per|\/)\s*(?:sq\.?\s?ft|sqft)\D{0,12}\d/i, reason: 'per-sq-ft figure' },
  { re: /\b(?:starts?\s+(?:at|from)|starting\s+(?:at|from))\b[^.]*\d/i, reason: '"starts at" + number' },
  { re: /\b(?:costs?|charge[sd]?|price[sd]?|budget\s+of|around|approximately|roughly|typically|about)\b[^.]{0,24}(?:₹|rs\.?|inr)?\s*\d[\d,]*\s*(?:lakh|lac|crore|k|rupees)/i, reason: 'quoted cost' },
];

function isAgentLine(line: string): boolean {
  return AGENT_LABELS.test(line.trim());
}

/** Scan an agent utterance string for leaks. Exported for the per-turn case. */
export function scanAgentText(text: string): PricingLeak[] {
  const leaks: PricingLeak[] = [];
  for (const { re, reason } of PATTERNS) {
    const m = text.match(re);
    if (m) {
      leaks.push({ snippet: text.trim().slice(0, 200), match: m[0], reason });
    }
  }
  return leaks;
}

/**
 * Scan a full transcript. Only agent/front-desk turns are checked.
 * Returns all distinct leaks (empty = clean).
 */
export function scanTranscriptForPricingLeaks(transcript: string): PricingLeak[] {
  const leaks: PricingLeak[] = [];
  const lines = transcript.split(/\r?\n/);
  for (const line of lines) {
    if (!isAgentLine(line)) continue;
    const body = line.replace(AGENT_LABELS, '').trim();
    leaks.push(...scanAgentText(body));
  }
  // De-dup on match text
  const seen = new Set<string>();
  return leaks.filter((l) => {
    const k = l.match.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
