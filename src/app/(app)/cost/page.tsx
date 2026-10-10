import { getCost, monthRange } from '@/lib/dashboard/queries';
import { Card, Stat, PageHeader, Th, Td } from '@/components/ui';
import { CostPie } from '@/components/charts';
import { inrExact, inr } from '@/lib/format';

const SOURCE_LABELS: Record<string, string> = {
  vaani_minutes: 'Vaani minutes',
  llm_tokens_in: 'LLM tokens (in)',
  llm_tokens_out: 'LLM tokens (out)',
  sms: 'SMS',
  telegram: 'Telegram',
  fixed: 'Supabase + Vercel (fixed)',
};

export default async function CostPage() {
  const range = monthRange();
  const c = await getCost(range);

  return (
    <>
      <PageHeader title="Cost" subtitle="What the system costs — and what it generates. This month." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total cost" value={inrExact(c.total)} sub="this month" />
        <Stat label="Per call" value={inrExact(c.perCall)} sub={`${c.counts.calls} calls`} />
        <Stat label="Per qualified lead" value={inrExact(c.perQualified)} sub={`${c.counts.qualified} qualified`} />
        <Stat label="Per booked consult" value={inrExact(c.perBooked)} sub={`${c.counts.booked} booked`} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Cost by source">
          <CostPie data={c.bySource.map((s) => ({ name: SOURCE_LABELS[s.source] ?? s.source, value: s.amount }))} />
          <table className="mt-3 w-full">
            <thead><tr><Th>Source</Th><Th className="text-right">Amount</Th></tr></thead>
            <tbody>
              {c.bySource.length === 0 && <tr><Td className="text-neutral-400">No billable events yet</Td><Td /></tr>}
              {c.bySource.map((s) => (
                <tr key={s.source} className="border-t border-neutral-100">
                  <Td>{SOURCE_LABELS[s.source] ?? s.source}</Td>
                  <Td className="text-right">{inrExact(s.amount)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Cost vs value">
          <div className="space-y-3 text-sm">
            <Row label="Estimated pipeline value" value={`${inr(c.pipelineValue.min)} – ${inr(c.pipelineValue.max)}`} />
            <Row label="Per won project" value={inrExact(c.perWon)} />
            <Row label="Front-desk cost-equivalent / mo" value={inrExact(c.frontdeskEquivalent)} />
            <Row label="System cost / mo" value={inrExact(c.total)} />
            <div className="rounded-xl bg-emerald-50 p-3 text-emerald-900">
              {c.total > 0 && c.frontdeskEquivalent > 0
                ? `System costs ${((c.total / c.frontdeskEquivalent) * 100).toFixed(1)}% of a front-desk's monthly cost.`
                : 'Add Supabase/Vercel fixed costs and front-desk cost in Settings for the full comparison.'}
            </div>
          </div>
        </Card>
      </div>

      <Card title="Rates (editable in Settings)" className="mt-4">
        <table className="w-full">
          <thead><tr><Th>Key</Th><Th>Value</Th><Th>Note</Th></tr></thead>
          <tbody>
            {c.rates.map((r) => (
              <tr key={r.key} className="border-t border-neutral-100">
                <Td className="font-mono text-xs">{r.key}</Td>
                <Td>{r.value} {r.currency}</Td>
                <Td className="text-neutral-500">{r.note}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
      <span className="text-neutral-600">{label}</span>
      <span className="font-medium text-neutral-900">{value}</span>
    </div>
  );
}
