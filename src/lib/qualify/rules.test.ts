import { describe, it, expect } from 'vitest';
import { qualify } from './rules';
import type { Extraction } from './schema';

function base(overrides: Partial<Extraction> = {}): Extraction {
  return {
    intent: 'new_project',
    caller_name: 'Test',
    phone: '+919812345678',
    language: 'English',
    project_type: 'residential_full',
    locality: 'Kothrud',
    city: 'Pune',
    in_service_area: 'yes',
    carpet_area_sqft: 1200,
    rooms_scope: ['kitchen', 'living', 'bedroom'],
    current_state: 'lived-in',
    is_rented: false,
    wants_execution: 'yes',
    timeline_text: 'done by next year, no rush',
    target_completion_date: null,
    weeks_available: null,
    budget_volunteered: false,
    budget_inr_min: null,
    budget_inr_max: null,
    decision_maker: 'yes',
    referral_source: null,
    referral_name: null,
    preferred_slots: [],
    consultation_booked: false,
    booked_slot_id: null,
    sentiment: 'positive',
    asked_about_pricing: false,
    is_repeat_caller: false,
    summary_for_designer: 'Full home redesign in Kothrud.',
    open_questions_for_designer: [],
    evidence: {},
    ...overrides,
  };
}

describe('rules engine — intent routing', () => {
  it('dropped call → CALLBACK_NEEDED', () => {
    expect(qualify(base({ intent: 'dropped' })).outcome).toBe('CALLBACK_NEEDED');
  });
  it('existing client complaint → ESCALATION', () => {
    const r = qualify(base({ intent: 'existing_client', sentiment: 'angry' }));
    expect(r.outcome).toBe('ESCALATION');
    expect(r.flags).toContain('FRUSTRATED');
  });
  it('vendor/spam → NOT_A_LEAD', () => {
    expect(qualify(base({ intent: 'other' })).outcome).toBe('NOT_A_LEAD');
  });
});

describe('rules engine — clean qualified', () => {
  it('T01-like referral, all pass → QUALIFIED', () => {
    const r = qualify(
      base({ referral_source: 'past client', referral_name: 'Shruti Joshi', carpet_area_sqft: 1400 }),
    );
    expect(r.outcome).toBe('QUALIFIED');
    expect(r.flags).toEqual([]);
  });
  it('T11-like rented, no structural → QUALIFIED', () => {
    const r = qualify(base({ is_rented: true, carpet_area_sqft: 900, locality: 'Baner' }));
    expect(r.outcome).toBe('QUALIFIED');
  });
  it('T15-like possession in 6 weeks (flexible completion) → QUALIFIED', () => {
    const r = qualify(base({ carpet_area_sqft: 875, weeks_available: null, current_state: 'new possession in 6 weeks' }));
    expect(r.outcome).toBe('QUALIFIED');
  });
});

describe('rules engine — flags → QUALIFIED_FLAGGED', () => {
  it('pricing asked → PRICING_ASKED', () => {
    const r = qualify(base({ asked_about_pricing: true }));
    expect(r.outcome).toBe('QUALIFIED_FLAGGED');
    expect(r.flags).toContain('PRICING_ASKED');
  });
  it('T02-like tight timeline + pricing', () => {
    const r = qualify(base({ asked_about_pricing: true, weeks_available: 9, target_completion_date: '2026-11-01' }));
    expect(r.outcome).toBe('QUALIFIED_FLAGGED');
    expect(r.flags).toEqual(expect.arrayContaining(['PRICING_ASKED', 'TIGHT_TIMELINE']));
  });
  it('T05-like VIP + large project', () => {
    const r = qualify(
      base({ carpet_area_sqft: 2400, rooms_scope: ['kitchen', 'b1', 'b2', 'b3', 'b4'], referral_source: 'close friend of Nikhil', referral_name: 'Vikram Agarwal' }),
    );
    expect(r.outcome).toBe('QUALIFIED_FLAGGED');
    expect(r.flags).toEqual(expect.arrayContaining(['VIP', 'LARGE_PROJECT']));
  });
  it('T12-like villa large project', () => {
    const r = qualify(base({ carpet_area_sqft: 5500, summary_for_designer: 'Villa, ground plus two floors.' }));
    expect(r.flags).toContain('LARGE_PROJECT');
    expect(r.outcome).toBe('QUALIFIED_FLAGGED');
  });
  it('T14-like decision maker unclear', () => {
    const r = qualify(base({ decision_maker: 'no', carpet_area_sqft: 1300 }));
    expect(r.outcome).toBe('QUALIFIED_FLAGGED');
    expect(r.flags).toContain('DECISION_MAKER_UNCLEAR');
  });
  it('T16-like repeat + frustrated', () => {
    const r = qualify(base({ is_repeat_caller: true, sentiment: 'frustrated' }));
    expect(r.outcome).toBe('QUALIFIED_FLAGGED');
    expect(r.flags).toEqual(expect.arrayContaining(['REPEAT_CALLER', 'FRUSTRATED']));
  });
  it('T06-like commercial 800 sqft → QUALIFIED (no flags)', () => {
    const r = qualify(base({ project_type: 'commercial_office', carpet_area_sqft: 800, locality: 'Baner', rooms_scope: ['workstations', 'cabin', 'meeting', 'break'], weeks_available: 13 }));
    expect(r.outcome).toBe('QUALIFIED');
  });
});

describe('rules engine — declines', () => {
  it('T03 out of area → DECLINED', () => {
    const r = qualify(base({ in_service_area: 'no', city: 'Nashik' }));
    expect(r.outcome).toBe('DECLINED');
    expect(r.decline_reason).toBe('out_of_area');
  });
  it('T04 advice only → DECLINED', () => {
    const r = qualify(base({ wants_execution: 'no', project_type: 'single_room' }));
    expect(r.outcome).toBe('DECLINED');
    expect(r.decline_reason).toBe('advice_only');
  });
  it('T10 volunteered budget below scope → DECLINED', () => {
    const r = qualify(
      base({ project_type: 'residential_partial', carpet_area_sqft: 550, locality: 'Kharadi', budget_volunteered: true, budget_inr_min: 100000, budget_inr_max: 150000 }),
    );
    expect(r.outcome).toBe('DECLINED');
    expect(r.decline_reason).toBe('budget_misaligned');
  });
  it('T18 commercial below min size → DECLINED', () => {
    const r = qualify(base({ project_type: 'commercial_other', carpet_area_sqft: 180 }));
    expect(r.outcome).toBe('DECLINED');
    expect(r.decline_reason).toBe('commercial_too_small');
  });
  it('T19 restaurant → DECLINED', () => {
    const r = qualify(base({ project_type: 'out_of_scope_category' }));
    expect(r.outcome).toBe('DECLINED');
    expect(r.decline_reason).toBe('out_of_scope_category');
  });
});

describe('rules engine — nurture', () => {
  it('T07 timeline too short (Diwali ~3 weeks) → NURTURE', () => {
    const r = qualify(base({ project_type: 'residential_partial', in_service_area: 'unclear', weeks_available: 3, target_completion_date: '2026-10-29' }));
    expect(r.outcome).toBe('NURTURE');
    expect(r.decline_reason).toBe('timeline_too_short');
    expect(r.follow_up_date).toBe('2026-10-29');
  });
});

describe('rules engine — budget volunteered OK does not flag/decline', () => {
  it('volunteered budget above scope min → QUALIFIED', () => {
    const r = qualify(base({ budget_volunteered: true, budget_inr_min: 1500000, budget_inr_max: 2000000 }));
    expect(r.outcome).toBe('QUALIFIED');
  });
});
