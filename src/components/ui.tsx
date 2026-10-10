import Link from 'next/link';
import type { ReactNode } from 'react';
import { OUTCOME_COLORS } from '@/lib/format';

export function Card({ title, children, className = '', accent }: { title?: string; children: ReactNode; className?: string; accent?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-line bg-white p-5 shadow-[0_1px_2px_rgba(28,25,23,0.04),0_8px_24px_-16px_rgba(28,25,23,0.12)] ${className}`}>
      {accent && <span className="absolute inset-x-0 top-0 h-0.5" style={{ background: accent }} />}
      {title && <h2 className="mb-3 text-sm font-semibold tracking-tight text-ink">{title}</h2>}
      {children}
    </div>
  );
}

export function Stat({ label, value, sub, accent = '#bd4a1e' }: { label: string; value: ReactNode; sub?: ReactNode; accent?: string }) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-line bg-white p-5 shadow-[0_1px_2px_rgba(28,25,23,0.04),0_8px_24px_-16px_rgba(28,25,23,0.12)] transition hover:shadow-[0_2px_4px_rgba(28,25,23,0.06),0_12px_32px_-16px_rgba(28,25,23,0.18)]">
      <span className="absolute left-0 top-0 h-full w-1" style={{ background: accent }} />
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
        <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: accent }} />
        {label}
      </div>
      <div className="mt-1.5 text-[26px] font-semibold leading-none tracking-tight text-ink">{value}</div>
      {sub != null && <div className="mt-1.5 text-xs text-ink-soft">{sub}</div>}
    </div>
  );
}

export function OutcomeBadge({ outcome }: { outcome: string | null }) {
  if (!outcome) return <span className="text-ink-soft/50">—</span>;
  const color = OUTCOME_COLORS[outcome] ?? '#6b7280';
  return (
    <span
      className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ color, background: `${color}1a`, boxShadow: `inset 0 0 0 1px ${color}33` }}
    >
      {outcome.replace(/_/g, ' ')}
    </span>
  );
}

export function FlagChips({ flags }: { flags: string[] }) {
  if (!flags?.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {flags.map((f) => (
        <span key={f} className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[11px] font-medium text-brand-700 ring-1 ring-inset ring-brand-100">
          {f}
        </span>
      ))}
    </span>
  );
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function Th({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return <th className={`px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-soft ${className}`}>{children}</th>;
}

export function Td({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return <td className={`px-3 py-2.5 align-top text-sm text-ink ${className}`}>{children}</td>;
}

export function LinkCell({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-medium text-brand-700 hover:text-brand-800 hover:underline">
      {children}
    </Link>
  );
}
