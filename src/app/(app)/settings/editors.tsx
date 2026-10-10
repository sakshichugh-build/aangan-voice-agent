'use client';

import { useState, useTransition } from 'react';
import { updateRate, updateDesigner, updateSettingJson, toggleServiceArea } from './actions';

function SaveState({ state }: { state: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (state === 'saving') return <span className="text-xs text-neutral-400">saving…</span>;
  if (state === 'saved') return <span className="text-xs text-emerald-600">saved ✓</span>;
  if (state === 'error') return <span className="text-xs text-red-600">error</span>;
  return null;
}

export function RateEditor({ rates }: { rates: { key: string; value: number; currency: string | null; note: string | null }[] }) {
  return (
    <div className="space-y-2">
      {rates.map((r) => <RateRow key={r.key} r={r} />)}
    </div>
  );
}

function RateRow({ r }: { r: { key: string; value: number; currency: string | null; note: string | null } }) {
  const [val, setVal] = useState(String(r.value));
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-neutral-100 py-1.5">
      <code className="w-56 text-xs text-neutral-600">{r.key}</code>
      <input value={val} onChange={(e) => setVal(e.target.value)} className="w-28 rounded border border-neutral-300 px-2 py-1 text-sm" />
      <span className="text-xs text-neutral-400">{r.currency}</span>
      <button
        disabled={pending}
        onClick={() => { setState('saving'); start(async () => { try { await updateRate(r.key, Number(val)); setState('saved'); } catch { setState('error'); } }); }}
        className="rounded bg-neutral-900 px-2 py-1 text-xs text-white disabled:opacity-50"
      >Save</button>
      <SaveState state={state} />
      <span className="flex-1 text-xs text-neutral-400">{r.note}</span>
    </div>
  );
}

export function DesignerEditor({ designers }: { designers: { id: string; name: string; email: string | null; is_principal: boolean; active: boolean; max_open_leads: number }[] }) {
  return (
    <div className="space-y-2">
      {designers.map((d) => <DesignerRow key={d.id} d={d} />)}
    </div>
  );
}

function DesignerRow({ d }: { d: { id: string; name: string; email: string | null; is_principal: boolean; active: boolean; max_open_leads: number } }) {
  const [email, setEmail] = useState(d.email ?? '');
  const [active, setActive] = useState(d.active);
  const [cap, setCap] = useState(String(d.max_open_leads));
  const [principal, setPrincipal] = useState(d.is_principal);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-neutral-100 py-1.5">
      <span className="w-24 text-sm font-medium">{d.name}</span>
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" className="w-56 rounded border border-neutral-300 px-2 py-1 text-sm" />
      <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> active</label>
      <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={principal} onChange={(e) => setPrincipal(e.target.checked)} /> principal</label>
      <label className="flex items-center gap-1 text-xs">cap <input value={cap} onChange={(e) => setCap(e.target.value)} className="w-14 rounded border border-neutral-300 px-1 py-1" /></label>
      <button
        disabled={pending}
        onClick={() => { setState('saving'); start(async () => { try { await updateDesigner(d.id, { email, active, is_principal: principal, max_open_leads: Number(cap) }); setState('saved'); } catch { setState('error'); } }); }}
        className="rounded bg-neutral-900 px-2 py-1 text-xs text-white disabled:opacity-50"
      >Save</button>
      <SaveState state={state} />
    </div>
  );
}

export function SettingJsonEditor({ settingKey, value }: { settingKey: string; value: unknown }) {
  const [text, setText] = useState(JSON.stringify(value, null, 2));
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [pending, start] = useTransition();
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center gap-2">
        <code className="text-xs font-medium text-neutral-700">{settingKey}</code>
        <button
          disabled={pending}
          onClick={() => { setState('saving'); start(async () => { try { await updateSettingJson(settingKey, text); setState('saved'); } catch { setState('error'); } }); }}
          className="rounded bg-neutral-900 px-2 py-0.5 text-xs text-white disabled:opacity-50"
        >Save</button>
        <SaveState state={state} />
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={text.split('\n').length} className="w-full rounded border border-neutral-300 p-2 font-mono text-xs" />
    </div>
  );
}

export function ServiceAreaToggle({ name, region, inService }: { name: string; region: string; inService: boolean }) {
  const [on, setOn] = useState(inService);
  const [pending, start] = useTransition();
  return (
    <label className="flex items-center gap-1.5 rounded border border-neutral-200 px-2 py-1 text-xs">
      <input
        type="checkbox" checked={on} disabled={pending}
        onChange={(e) => { const v = e.target.checked; setOn(v); start(async () => { try { await toggleServiceArea(name, v); } catch { setOn(!v); } }); }}
      />
      {name} <span className="text-neutral-400">{region}</span>
    </label>
  );
}
