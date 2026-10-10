import { getInbox } from '@/lib/dashboard/detail';
import { PageHeader, Card, Th, Td, OutcomeBadge, FlagChips, LinkCell } from '@/components/ui';
import { dt, dur } from '@/lib/format';

export default async function InboxPage() {
  const rows = await getInbox(150);

  return (
    <>
      <PageHeader title="Inbox" subtitle="Every call the agent handled — newest first." />
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <Th>When</Th><Th>Caller</Th><Th>Outcome</Th><Th>Flags</Th><Th>Duration</Th><Th>Media</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><Td className="text-neutral-400">No calls yet. They appear here as the agent handles them.</Td><Td /><Td /><Td /><Td /><Td /></tr>
              )}
              {rows.map((r) => (
                <tr key={r.callId} className="border-t border-neutral-100 hover:bg-neutral-50">
                  <Td className="whitespace-nowrap">
                    <LinkCell href={`/leads/${r.callId}`}>{dt(r.startedAt)}</LinkCell>
                    {r.afterHours && <span className="ml-1 rounded bg-indigo-100 px-1 text-[10px] text-indigo-700">after hrs</span>}
                  </Td>
                  <Td>
                    <div className="font-medium text-neutral-900">{r.leadName ?? 'Unknown'}</div>
                    <div className="text-xs text-neutral-500">{r.phone ?? '—'}</div>
                  </Td>
                  <Td><OutcomeBadge outcome={r.outcome} /></Td>
                  <Td><FlagChips flags={r.flags} /></Td>
                  <Td className="whitespace-nowrap">{dur(r.durationSec)}</Td>
                  <Td className="whitespace-nowrap text-xs text-neutral-500">
                    {r.hasTranscript ? '📄' : ''} {r.hasRecording ? '▶' : ''}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
