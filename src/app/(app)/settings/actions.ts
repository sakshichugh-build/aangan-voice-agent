'use server';

import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

async function requireStaff(): Promise<void> {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not authenticated');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (!profile || !['founder', 'front_desk'].includes(profile.role)) throw new Error('forbidden');
}

export async function updateRate(key: string, value: number) {
  await requireStaff();
  await supabaseAdmin().from('rates').update({ value, updated_at: new Date().toISOString() }).eq('key', key);
  revalidatePath('/settings');
  revalidatePath('/cost');
}

export async function updateDesigner(
  id: string,
  patch: { email?: string; active?: boolean; max_open_leads?: number; is_principal?: boolean },
) {
  await requireStaff();
  await supabaseAdmin().from('designers').update(patch).eq('id', id);
  revalidatePath('/settings');
}

/** Store a settings value. Accepts a JSON string; falls back to a raw string value. */
export async function updateSettingJson(key: string, jsonText: string) {
  await requireStaff();
  let value: unknown;
  try {
    value = JSON.parse(jsonText);
  } catch {
    throw new Error('Invalid JSON');
  }
  await supabaseAdmin().from('settings').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  revalidatePath('/settings');
}

export async function toggleServiceArea(name: string, inService: boolean) {
  await requireStaff();
  await supabaseAdmin().from('service_areas').update({ in_service: inService }).ilike('name', name);
  revalidatePath('/settings');
}
