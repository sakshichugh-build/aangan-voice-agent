import type { Flag } from '@/lib/qualify/rules';

export interface DesignerLite {
  id: string;
  name: string;
  email: string | null;
  active: boolean;
  is_principal: boolean;
  max_open_leads: number;
  open_leads: number;
}

export interface AssignResult {
  designerId: string | null;
  copyNikhil: boolean;
  reason: string;
  allAtCapacity: boolean;
}

/**
 * Round-robin among active designers, skipping anyone at capacity.
 * VIP / LARGE_PROJECT → principal designer + copy Nikhil.
 * If everyone is at capacity, fall back to the least-loaded active designer
 * (a lead is never dropped) and report allAtCapacity so the front desk is told.
 * Pure + deterministic: pass lastAssignedId to advance the rotation.
 */
export function assignDesigner(
  designers: DesignerLite[],
  flags: Flag[],
  lastAssignedId?: string | null,
): AssignResult {
  const active = designers.filter((d) => d.active).sort((a, b) => a.id.localeCompare(b.id));
  if (active.length === 0) {
    return { designerId: null, copyNikhil: false, reason: 'no_active_designers', allAtCapacity: true };
  }

  const underCap = (d: DesignerLite) => d.open_leads < d.max_open_leads;
  const priority = flags.includes('VIP') || flags.includes('LARGE_PROJECT');

  // VIP / large → principal (prefer under capacity; else lowest-loaded principal)
  if (priority) {
    const principals = active.filter((d) => d.is_principal);
    if (principals.length) {
      const pick =
        principals.filter(underCap).sort((a, b) => a.open_leads - b.open_leads)[0] ??
        principals.sort((a, b) => a.open_leads - b.open_leads)[0];
      return {
        designerId: pick.id,
        copyNikhil: true,
        reason: 'VIP/large project → principal designer + copy Nikhil',
        allAtCapacity: !underCap(pick),
      };
    }
    // No principal configured — fall through to round-robin but still copy Nikhil.
  }

  const eligible = active.filter(underCap);
  const allAtCapacity = eligible.length === 0;
  const pool = allAtCapacity
    ? [[...active].sort((a, b) => a.open_leads - b.open_leads || a.id.localeCompare(b.id))[0]]
    : eligible;

  // Advance the rotation from lastAssignedId over the stable active ordering.
  let pick = pool[0];
  if (lastAssignedId) {
    const startIdx = active.findIndex((d) => d.id === lastAssignedId);
    if (startIdx >= 0) {
      for (let step = 1; step <= active.length; step++) {
        const cand = active[(startIdx + step) % active.length];
        if (pool.some((p) => p.id === cand.id)) {
          pick = cand;
          break;
        }
      }
    }
  }

  return {
    designerId: pick.id,
    copyNikhil: priority, // true only if VIP/large but no principal existed
    reason: allAtCapacity ? 'all_at_capacity_fallback_least_loaded' : 'round_robin',
    allAtCapacity,
  };
}
