import { formatInTimeZone } from 'date-fns-tz';

const IST = 'Asia/Kolkata';

export function inr(n: number | null | undefined): string {
  if (n == null) return '—';
  if (Math.abs(n) >= 100000) return `₹${(n / 100000).toLocaleString('en-IN', { maximumFractionDigits: 2 })}L`;
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export function inrExact(n: number | null | undefined): string {
  if (n == null) return '—';
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export function pct(n: number | null | undefined, digits = 0): string {
  if (n == null) return '—';
  return `${n.toFixed(digits)}%`;
}

export function dt(iso: string | null | undefined): string {
  if (!iso) return '—';
  return formatInTimeZone(new Date(iso), IST, 'd MMM, h:mmaaa');
}

export function dateOnly(iso: string | null | undefined): string {
  if (!iso) return '—';
  return formatInTimeZone(new Date(iso), IST, 'd MMM yyyy');
}

export function dur(sec: number | null | undefined): string {
  if (!sec || sec <= 0) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m${String(s).padStart(2, '0')}s`;
}

export function mins(m: number | null | undefined): string {
  if (m == null) return '—';
  if (m < 60) return `${m.toFixed(0)}m`;
  return `${(m / 60).toFixed(1)}h`;
}

export const OUTCOME_COLORS: Record<string, string> = {
  QUALIFIED: '#047857',
  QUALIFIED_FLAGGED: '#ca8a04',
  NURTURE: '#2563eb',
  DECLINED: '#6b7280',
  ESCALATION: '#dc2626',
  CALLBACK_NEEDED: '#9333ea',
  NEEDS_REVIEW: '#ea580c',
  NOT_A_LEAD: '#9ca3af',
};
