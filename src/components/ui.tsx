import Link from 'next/link';
import type { ReactNode } from 'react';
import { OUTCOME_COLORS } from '@/lib/format';

export function Card({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-neutral-200 bg-white p-5 ${className}`}>
      {title && <h2 className="mb-3 text-sm font-semibold text-neutral-900">{title}</h2>}
      {children}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-neutral-900">{value}</div>
      {sub != null && <div className="mt-1 text-xs text-neutral-500">{sub}</div>}
    </div>
  );
}

export function OutcomeBadge({ outcome }: { outcome: string | null }) {
  if (!outcome) return <span className="text-neutral-400">—</span>;
  const color = OUTCOME_COLORS[outcome] ?? '#6b7280';
  return (
    <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ background: color }}>
      {outcome.replace(/_/g, ' ')}
    </span>
  );
}

export function FlagChips({ flags }: { flags: string[] }) {
  if (!flags?.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {flags.map((f) => (
        <span key={f} className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
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
        <h1 className="text-xl font-semibold text-neutral-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-neutral-500">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function Th({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return <th className={`px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-neutral-500 ${className}`}>{children}</th>;
}

export function Td({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return <td className={`px-3 py-2 align-top text-sm text-neutral-800 ${className}`}>{children}</td>;
}

export function LinkCell({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-blue-600 hover:underline">
      {children}
    </Link>
  );
}
