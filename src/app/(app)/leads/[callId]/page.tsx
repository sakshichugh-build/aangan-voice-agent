import { getLeadDetail } from '@/lib/dashboard/detail';
import { Card, PageHeader, OutcomeBadge, FlagChips, Th, Td } from '@/components/ui';
import { dt, dur } from '@/lib/format';
import { notFound } from 'next/navigation';

export default async function LeadDetailPage({ params }: { params: Promise<{ callId: string }> }) {
  const { callId } = await params;
  const d = await getLeadDetail(callId);
  if (!d.call) notFound();

  const ex = d.extraction ?? {};
  const call = d.call as Record<string, unknown>;

  const fieldRows: [string, unknown][] = [
    ['Name', ex.caller_name], ['Phone', ex.phone], ['Language', ex.language],
    ['Project type', ex.project_type], ['Locality', ex.locality], ['City', ex.city],
    ['In service area', ex.in_service_area], ['Carpet area (sqft)', ex.carpet_area_sqft],
    ['Rooms', Array.isArray(ex.rooms_scope) ? (ex.rooms_scope as string[]).join(', ') : ex.rooms_scope],
    ['Current state', ex.current_state], ['Rented', String(ex.is_rented)],
    ['Wants execution', ex.wants_execution], ['Timeline', ex.timeline_text],
    ['Weeks available', ex.weeks_available], ['Budget volunteered', String(ex.budget_volunteered)],
    ['Decision maker', ex.decision_maker], ['Referral', ex.referral_source],
    ['Asked pricing', String(ex.asked_about_pricing)], ['Sentiment', ex.sentiment],
    ['Consultation booked', String(ex.consultation_booked)],
  ];

  return (
    <>
      <PageHeader title={(ex.caller_name as string) ?? 'Lead'} subtitle={`${dt(call.started_at as string)} · ${dur(call.duration_sec as number)}${call.after_hours ? ' · after hours' : ''}`}>
        <div className="flex items-center gap-2">
          {d.qualification && <OutcomeBadge outcome={d.qualification.outcome} />}
          {d.qualification && <FlagChips flags={d.qualification.flags} />}
        </div>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Extracted fields & evidence">
          <table className="w-full">
            <tbody>
              {fieldRows.map(([label, val]) => (
                <tr key={label} className="border-b border-neutral-100 align-top">
                  <Td className="w-40 text-neutral-500">{label}</Td>
                  <Td>
                    {val == null || val === 'null' || val === '' ? <span className="text-neutral-400">—</span> : String(val)}
                    {d.evidence[fieldKey(label)] && (
                      <div className="mt-0.5 text-xs italic text-neutral-400">“{d.evidence[fieldKey(label)]}”</div>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <div className="space-y-4">
          <Card title="Rule trace (why this outcome)">
            {d.qualification?.decline_reason && (
              <p className="mb-2 text-sm text-neutral-700">Decline reason: <strong>{d.qualification.decline_reason}</strong></p>
            )}
            <ul className="space-y-1 text-sm">
              {(d.qualification?.rule_trace ?? []).map((t, i) => (
                <li key={i} className="flex gap-2">
                  <span className={statusColor(t.status)}>{statusIcon(t.status)}</span>
                  <span className="text-neutral-500">{t.criterion}:</span>
                  <span className="text-neutral-800">{t.detail}</span>
                </li>
              ))}
              {!d.qualification && <li className="text-neutral-400">Not yet processed.</li>}
            </ul>
          </Card>

          <Card title="Handoff & SLA timeline">
            {d.handoffs.length === 0 && <p className="text-sm text-neutral-400">No handoff (not a qualified lead, or pending).</p>}
            {d.handoffs.map((h, i) => (
              <div key={i} className="space-y-1 text-sm">
                <div>Designer: <strong>{h.designer ?? '—'}</strong></div>
                <Timeline label="Sent" at={h.sent_at} />
                <Timeline label="Claimed" at={h.claimed_at} />
                <Timeline label="Called" at={h.called_at} />
                {h.reping_count > 0 && <div className="text-xs text-amber-700">Re-pinged {h.reping_count}×</div>}
                {h.escalated_at && <div className="text-xs text-red-700">Escalated at {dt(h.escalated_at)}</div>}
                {h.outcome && <div>Outcome: <strong>{h.outcome.replace(/_/g, ' ')}</strong></div>}
              </div>
            ))}
          </Card>

          {d.guardrails.length > 0 && (
            <Card title="Guardrail events">
              <ul className="space-y-1 text-sm">
                {d.guardrails.map((g, i) => (
                  <li key={i} className="text-red-700">{g.type}: {g.detail} {g.evidence && <span className="text-neutral-500">— {g.evidence}</span>}</li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <Card title="Transcript" className="mt-4">
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap text-sm text-neutral-700">{d.transcript ?? 'No transcript.'}</pre>
      </Card>
    </>
  );
}

function fieldKey(label: string): string {
  const map: Record<string, string> = {
    Name: 'caller_name', Phone: 'phone', Language: 'language', 'Project type': 'project_type',
    Locality: 'locality', City: 'city', 'In service area': 'in_service_area', 'Carpet area (sqft)': 'carpet_area_sqft',
    'Current state': 'current_state', 'Wants execution': 'wants_execution', Timeline: 'timeline_text',
    'Weeks available': 'weeks_available', 'Decision maker': 'decision_maker', Referral: 'referral_source',
    'Asked pricing': 'asked_about_pricing', Sentiment: 'sentiment',
  };
  return map[label] ?? label;
}
function statusIcon(s: string) { return s === 'pass' ? '✓' : s === 'fail' ? '✗' : s === 'flag' ? '⚑' : '•'; }
function statusColor(s: string) { return s === 'pass' ? 'text-emerald-600' : s === 'fail' ? 'text-red-600' : s === 'flag' ? 'text-amber-600' : 'text-neutral-400'; }

function Timeline({ label, at }: { label: string; at: string | null }) {
  return <div className="text-neutral-600">{label}: {at ? <span className="text-neutral-900">{dt(at)}</span> : <span className="text-neutral-400">—</span>}</div>;
}
