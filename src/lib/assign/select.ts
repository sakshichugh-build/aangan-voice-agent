import type { SupabaseClient } from '@supabase/supabase-js';
import { assignDesigner, type DesignerLite } from './round-robin';
import type { Flag } from '@/lib/qualify/rules';

export interface SelectedDesigner {
  designer: { id: string; name: string; email: string | null; is_principal: boolean } | null;
  copyNikhil: boolean;
  allAtCapacity: boolean;
  reason: string;
}

const CURSOR_KEY = 'last_assigned_designer_id';

/**
 * Select a designer for a lead: active designers, live open-lead counts,
 * round-robin cursor from settings. VIP/LARGE_PROJECT → principal + copy Nikhil.
 */
export async function selectDesignerForLead(
  db: SupabaseClient,
  flags: Flag[],
  maxOpenDefault = 5,
): Promise<SelectedDesigner> {
  const { data: designers } = await db
    .from('designers')
    .select('id,name,email,active,is_principal,max_open_leads');

  // Count open handoffs (assigned, not yet resolved) per designer.
  const { data: openRows } = await db
    .from('handoffs')
    .select('designer_id')
    .is('outcome', null);
  const openCount = new Map<string, number>();
  for (const r of openRows ?? []) {
    const id = (r as { designer_id: string | null }).designer_id;
    if (id) openCount.set(id, (openCount.get(id) ?? 0) + 1);
  }

  const lite: DesignerLite[] = (designers ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    email: d.email,
    active: d.active,
    is_principal: d.is_principal,
    max_open_leads: d.max_open_leads ?? maxOpenDefault,
    open_leads: openCount.get(d.id) ?? 0,
  }));

  const { data: cursorRow } = await db.from('settings').select('value').eq('key', CURSOR_KEY).maybeSingle();
  const lastAssignedId = cursorRow?.value ? String(cursorRow.value).replace(/"/g, '') : null;

  const result = assignDesigner(lite, flags, lastAssignedId);
  const picked = result.designerId ? lite.find((d) => d.id === result.designerId) ?? null : null;

  // Persist rotation cursor.
  if (picked) {
    await db.from('settings').upsert(
      { key: CURSOR_KEY, value: JSON.stringify(picked.id), updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    );
  }

  return {
    designer: picked ? { id: picked.id, name: picked.name, email: picked.email, is_principal: picked.is_principal } : null,
    copyNikhil: result.copyNikhil,
    allAtCapacity: result.allAtCapacity,
    reason: result.reason,
  };
}
