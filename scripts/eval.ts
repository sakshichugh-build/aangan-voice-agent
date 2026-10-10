/**
 * Transcript eval harness (§10). Parses the 20 phone transcripts from
 * seed/eval/*.txt, runs P2 (Claude extraction) → P3 (rules) → P4 (pricing scan),
 * compares to expected outcomes, and prints a pass/fail table.
 *
 * Target: ≥ 18/20 correct outcomes, and ZERO pricing leaks.
 *
 *   npm run eval            # needs ANTHROPIC_API_KEY in .env.local
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { extractLead } from '@/lib/extract/lead';
import { qualify, type Flag, type Outcome } from '@/lib/qualify/rules';
import { scanTranscriptForPricingLeaks } from '@/lib/guardrails/pricing';
import { llmCostRows, totalInr } from '@/lib/cost/ledger';

interface Expected {
  outcome: Outcome;
  flags?: Flag[];
}

const EXPECTED: Record<string, Expected> = {
  T01: { outcome: 'QUALIFIED' },
  T02: { outcome: 'QUALIFIED_FLAGGED', flags: ['PRICING_ASKED', 'TIGHT_TIMELINE'] },
  T03: { outcome: 'DECLINED' },
  T04: { outcome: 'DECLINED' },
  T05: { outcome: 'QUALIFIED_FLAGGED', flags: ['VIP', 'LARGE_PROJECT'] },
  T06: { outcome: 'QUALIFIED' },
  T07: { outcome: 'NURTURE' },
  T08: { outcome: 'CALLBACK_NEEDED' },
  T09: { outcome: 'ESCALATION' },
  T10: { outcome: 'DECLINED' },
  T11: { outcome: 'QUALIFIED' },
  T12: { outcome: 'QUALIFIED_FLAGGED', flags: ['LARGE_PROJECT'] },
  T13: { outcome: 'QUALIFIED_FLAGGED', flags: ['PRICING_ASKED'] },
  T14: { outcome: 'QUALIFIED_FLAGGED', flags: ['DECISION_MAKER_UNCLEAR'] },
  T15: { outcome: 'QUALIFIED' },
  T16: { outcome: 'QUALIFIED_FLAGGED', flags: ['REPEAT_CALLER', 'FRUSTRATED'] },
  T17: { outcome: 'QUALIFIED' },
  T18: { outcome: 'DECLINED' },
  T19: { outcome: 'DECLINED' },
  T20: { outcome: 'QUALIFIED' },
};

const EVAL_DIR = join(process.cwd(), 'seed', 'eval');
const CONCURRENCY = 4;

interface Row {
  id: string;
  expected: Outcome;
  got: Outcome | 'EXTRACT_FAIL';
  pass: boolean;
  flagsOk: boolean;
  gotFlags: Flag[];
  missingFlags: Flag[];
  leaks: number;
  inTok: number;
  outTok: number;
}

async function runOne(id: string, transcript: string): Promise<Row> {
  const exp = EXPECTED[id];
  const leaks = scanTranscriptForPricingLeaks(transcript);
  const ex = await extractLead(transcript);

  if (!ex.valid || !ex.extraction) {
    return {
      id, expected: exp.outcome, got: 'EXTRACT_FAIL', pass: false, flagsOk: false,
      gotFlags: [], missingFlags: exp.flags ?? [], leaks: leaks.length,
      inTok: ex.inputTokens, outTok: ex.outputTokens,
    };
  }

  const q = qualify(ex.extraction);
  const pass = q.outcome === exp.outcome;
  const missingFlags = (exp.flags ?? []).filter((f) => !q.flags.includes(f));
  return {
    id, expected: exp.outcome, got: q.outcome, pass, flagsOk: missingFlags.length === 0,
    gotFlags: q.flags, missingFlags, leaks: leaks.length,
    inTok: ex.inputTokens, outTok: ex.outputTokens,
  };
}

async function main() {
  const ids = readdirSync(EVAL_DIR)
    .filter((f) => /^T\d{2}\.txt$/.test(f))
    .map((f) => f.replace('.txt', ''))
    .sort();

  const rows: Row[] = [];
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const batch = ids.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map((id) => runOne(id, readFileSync(join(EVAL_DIR, `${id}.txt`), 'utf8'))),
    );
    rows.push(...results);
  }
  rows.sort((a, b) => a.id.localeCompare(b.id));

  // Print table
  console.log('\n ID   expected            got                 outcome  flags');
  console.log(' ───  ──────────────────  ──────────────────  ───────  ─────');
  for (const r of rows) {
    const mark = r.pass ? '  ✓    ' : '  ✗    ';
    const flagNote = r.missingFlags.length ? `missing ${r.missingFlags.join(',')}` : r.flagsOk ? 'ok' : '';
    console.log(
      ` ${r.id}  ${r.expected.padEnd(18)}  ${String(r.got).padEnd(18)}  ${mark}  ${flagNote}`,
    );
  }

  const correct = rows.filter((r) => r.pass).length;
  const totalLeaks = rows.reduce((s, r) => s + r.leaks, 0);
  const inTok = rows.reduce((s, r) => s + r.inTok, 0);
  const outTok = rows.reduce((s, r) => s + r.outTok, 0);
  const costInr = totalInr(llmCostRows(inTok, outTok, 'eval'));

  console.log('\n────────────────────────────────────────────────────────────');
  console.log(` Outcomes correct : ${correct}/${rows.length}   (target ≥ 18/20)`);
  console.log(` Pricing leaks    : ${totalLeaks}            (target 0)`);
  console.log(` Flag mismatches  : ${rows.filter((r) => !r.flagsOk).length}`);
  console.log(` Tokens           : ${inTok} in / ${outTok} out`);
  console.log(` Est. LLM cost    : ₹${costInr.toFixed(2)} for all 20 extractions`);
  console.log('────────────────────────────────────────────────────────────');

  const ok = correct >= 18 && totalLeaks === 0;
  console.log(ok ? '\n✅ EVAL PASSED\n' : '\n❌ EVAL FAILED\n');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
