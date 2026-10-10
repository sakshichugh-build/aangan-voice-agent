import { describe, it, expect } from 'vitest';
import { assignDesigner, type DesignerLite } from './round-robin';

function mk(id: string, over: Partial<DesignerLite> = {}): DesignerLite {
  return { id, name: id, email: `${id}@x.com`, active: true, is_principal: false, max_open_leads: 5, open_leads: 0, ...over };
}

describe('round-robin assignment', () => {
  it('rotates through active designers', () => {
    const ds = [mk('a'), mk('b'), mk('c')];
    expect(assignDesigner(ds, [], null).designerId).toBe('a');
    expect(assignDesigner(ds, [], 'a').designerId).toBe('b');
    expect(assignDesigner(ds, [], 'b').designerId).toBe('c');
    expect(assignDesigner(ds, [], 'c').designerId).toBe('a'); // wrap
  });

  it('skips designers at capacity', () => {
    const ds = [mk('a', { open_leads: 5 }), mk('b'), mk('c', { open_leads: 5 })];
    // After 'a', next eligible under cap is 'b' (c is full)
    expect(assignDesigner(ds, [], 'a').designerId).toBe('b');
    // After 'b', c is full, wrap to b again? rotation: c full, a full → b
    expect(assignDesigner(ds, [], 'b').designerId).toBe('b');
  });

  it('skips inactive designers', () => {
    const ds = [mk('a', { active: false }), mk('b'), mk('c')];
    expect(assignDesigner(ds, [], null).designerId).toBe('b');
  });

  it('VIP → principal + copy Nikhil', () => {
    const ds = [mk('a'), mk('p', { is_principal: true }), mk('c')];
    const r = assignDesigner(ds, ['VIP'], null);
    expect(r.designerId).toBe('p');
    expect(r.copyNikhil).toBe(true);
  });

  it('LARGE_PROJECT → principal + copy Nikhil', () => {
    const ds = [mk('a'), mk('p', { is_principal: true })];
    const r = assignDesigner(ds, ['LARGE_PROJECT'], null);
    expect(r.designerId).toBe('p');
    expect(r.copyNikhil).toBe(true);
  });

  it('all at capacity → least loaded fallback, allAtCapacity true', () => {
    const ds = [mk('a', { open_leads: 6 }), mk('b', { open_leads: 5 }), mk('c', { open_leads: 7 })];
    const r = assignDesigner(ds, [], null);
    expect(r.allAtCapacity).toBe(true);
    expect(r.designerId).toBe('b'); // least loaded
  });

  it('no active designers → null', () => {
    const r = assignDesigner([mk('a', { active: false })], [], null);
    expect(r.designerId).toBeNull();
  });
});
