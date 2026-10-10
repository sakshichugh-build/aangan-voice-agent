import { getOverview, monthRange, prevMonthRange } from '@/lib/dashboard/queries';
import { Card, Stat, PageHeader, Th, Td } from '@/components/ui';
import { FunnelBars, CategoryBars } from '@/components/charts';
import { inr, pct, mins, dur } from '@/lib/format';

export default async function OverviewPage() {
  const range = monthRange();
  const prev = prevMonthRange(range);
  const [m, pm] = await Promise.all([getOverview(range), getOverview(prev)]);

  const delta = (cur: number, was: number) => {
    if (!was) return cur ? '▲ new' : '—';
    const d = Math.round(((cur - was) / was) * 100);
    return `${d >= 0 ? '▲' : '▼'} ${Math.abs(d)}% vs last month`;
  };

  const funnel = [
    { stage: 'Calls', value: m.funnel.calls },
    { stage: 'Real leads', value: m.funnel.realLeads },
    { stage: 'Qualified', value: m.funnel.qualified },
    { stage: 'Booked', value: m.funnel.booked },
    { stage: 'Held', value: m.funnel.held },
    { stage: 'Won', value: m.funnel.won },
  ];

  return (
    <>
      <PageHeader title="Overview" subtitle="This month · Asia/Kolkata" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Enquiries (calls)" value={m.calls} sub={delta(m.calls, pm.calls)} />
        <Stat label="After-hours share" value={pct(m.afterHoursShare * 100)} sub="of all calls" />
        <Stat label="Answered < 5 min" value={pct(m.answeredWithin5minPct)} sub="target 100%" />
        <Stat label="Median answer" value={m.medianAnswerSec == null ? '—' : dur(Math.round(m.medianAnswerSec))} sub="pickup time" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Funnel">
          <FunnelBars data={funnel} />
        </Card>
        <Card title="Decline reasons">
          <CategoryBars data={m.declineReasons.map((d) => ({ label: d.reason.replace(/_/g, ' '), value: d.count }))} color="#6b7280" />
          <p className="mt-3 text-xs text-neutral-500">Nurture queue: {m.nurtureQueue} open follow-ups</p>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Designer speed">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Mini label="Median time-to-claim" value={mins(m.designerSpeed.medianTimeToClaimMin)} />
            <Mini label="Claimed < 15 min" value={pct(m.designerSpeed.pctClaimedUnder15)} />
            <Mini label="Called < 1 hr" value={pct(m.designerSpeed.pctCalledUnder60)} />
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full">
              <thead><tr><Th>Designer</Th><Th>Assigned</Th><Th>Claimed</Th><Th>Median claim</Th></tr></thead>
              <tbody>
                {m.designerSpeed.perDesigner.length === 0 && (
                  <tr><Td className="text-neutral-400" >No handoffs yet</Td><Td>—</Td><Td>—</Td><Td>—</Td></tr>
                )}
                {m.designerSpeed.perDesigner.map((d) => (
                  <tr key={d.name} className="border-t border-neutral-100">
                    <Td>{d.name}</Td><Td>{d.assigned}</Td><Td>{d.claimed}</Td><Td>{mins(d.medianClaimMin)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Pipeline value (estimate)">
          <div className="text-3xl font-semibold text-neutral-900">
            {inr(m.pipelineValue.min)} – {inr(m.pipelineValue.max)}
          </div>
          <p className="mt-2 text-sm text-neutral-600">
            {m.pipelineValue.qualified} qualified leads × ₹8–14L band. Clearly an estimate — won value shows once designers record actuals.
          </p>
          <p className="mt-1 text-xs text-neutral-400">{delta(m.funnel.qualified, pm.funnel.qualified)}</p>
        </Card>
      </div>
    </>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-neutral-50 p-3">
      <div className="text-lg font-semibold text-neutral-900">{value}</div>
      <div className="mt-0.5 text-[11px] text-neutral-500">{label}</div>
    </div>
  );
}
