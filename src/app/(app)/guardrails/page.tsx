import { getGuardrails } from '@/lib/dashboard/detail';
import { Card, PageHeader, Th, Td, LinkCell } from '@/components/ui';
import { dt } from '@/lib/format';

export default async function GuardrailsPage() {
  const g = await getGuardrails();

  return (
    <>
      <PageHeader title="Guardrails" subtitle="Pricing leaks, failed extractions, unclaimed leads, missed callbacks." />

      <div className="grid gap-4">
        <Card title={`Pricing leaks (${g.pricingLeaks.length})`}>
          {g.pricingLeaks.length === 0 ? (
            <p className="text-sm text-emerald-700">✓ No pricing leaks detected. The agent never stated a price.</p>
          ) : (
            <table className="w-full">
              <thead><tr><Th>When</Th><Th>Detail</Th><Th>Evidence</Th><Th>Call</Th></tr></thead>
              <tbody>
                {g.pricingLeaks.map((l, i) => (
                  <tr key={i} className="border-t border-neutral-100">
                    <Td className="whitespace-nowrap">{dt(l.created_at)}</Td>
                    <Td className="text-red-700">{l.detail}</Td>
                    <Td className="text-xs text-neutral-500">{l.evidence}</Td>
                    <Td><LinkCell href={`/leads/${l.callId}`}>open</LinkCell></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title={`Failed extractions (${g.failedExtractions.length})`}>
          {g.failedExtractions.length === 0 ? (
            <p className="text-sm text-neutral-500">None.</p>
          ) : (
            g.failedExtractions.map((f, i) => (
              <div key={i} className="flex justify-between border-t border-neutral-100 py-1 text-sm">
                <span className="text-orange-700">{f.detail}</span>
                <LinkCell href={`/leads/${f.callId}`}>{dt(f.created_at)}</LinkCell>
              </div>
            ))
          )}
        </Card>

        <Card title={`Unclaimed leads (${g.unclaimedLeads.length})`}>
          {g.unclaimedLeads.length === 0 ? (
            <p className="text-sm text-neutral-500">All leads claimed.</p>
          ) : (
            <table className="w-full">
              <thead><tr><Th>Sent</Th><Th>Designer</Th><Th>Re-pings</Th><Th>Escalated</Th><Th>Call</Th></tr></thead>
              <tbody>
                {g.unclaimedLeads.map((u, i) => (
                  <tr key={i} className="border-t border-neutral-100">
                    <Td className="whitespace-nowrap">{dt(u.sent_at)}</Td>
                    <Td>{u.designer ?? '—'}</Td>
                    <Td>{u.repingCount}</Td>
                    <Td>{u.escalated ? <span className="text-red-700">yes</span> : 'no'}</Td>
                    <Td><LinkCell href={`/leads/${u.callId}`}>open</LinkCell></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title={`Missed senior callbacks (${g.missedCallbacks.length})`}>
          {g.missedCallbacks.length === 0 ? (
            <p className="text-sm text-neutral-500">None overdue.</p>
          ) : (
            g.missedCallbacks.map((m, i) => (
              <div key={i} className="flex justify-between border-t border-neutral-100 py-1 text-sm">
                <span className="text-red-700">Promised by {dt(m.promised_callback_by)}</span>
                <LinkCell href={`/leads/${m.callId}`}>open</LinkCell>
              </div>
            ))
          )}
        </Card>
      </div>
    </>
  );
}
