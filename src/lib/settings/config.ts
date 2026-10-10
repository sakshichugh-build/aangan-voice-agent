import { supabaseAdmin } from '@/lib/supabase/admin';
import { DEFAULT_RULES_CONFIG, type RulesConfig } from '@/lib/qualify/config';
import { DEFAULT_OFFICE_HOURS, type OfficeHours } from '@/lib/time/office-hours';
import { DEFAULT_RATES, type Rates } from '@/lib/cost/ledger';

/** Reads all settings rows once and exposes typed getters with safe fallbacks. */
export interface AppSettings {
  rules: RulesConfig;
  officeHours: OfficeHours;
  rates: Rates;
  sla: { claim_minutes: number; escalate_minutes: number; designer_call_minutes: number };
  escalationCallbackMinutes: number;
  callbackWindow: { start: string; end: string; tz: string };
  afterHoursCallbackAt: string;
  maxOpenLeadsDefault: number;
  pipelineValueBand: { min_inr: number; max_inr: number };
}

export async function loadSettings(): Promise<AppSettings> {
  const db = supabaseAdmin();
  const [{ data: settingsRows }, { data: rateRows }] = await Promise.all([
    db.from('settings').select('key,value'),
    db.from('rates').select('key,value'),
  ]);

  const s = new Map((settingsRows ?? []).map((r) => [r.key as string, r.value as unknown]));
  const rates: Rates = { ...DEFAULT_RATES };
  for (const r of rateRows ?? []) rates[r.key as string] = Number(r.value);

  const budget = (s.get('budget_thresholds') as Record<string, number>) ?? {};
  const commercial = (s.get('commercial_size') as Record<string, number>) ?? {};
  const timeline = (s.get('timeline') as Record<string, number>) ?? {};

  const rules: RulesConfig = {
    budget: {
      residential_full_min_inr: budget.residential_full_min_inr ?? DEFAULT_RULES_CONFIG.budget.residential_full_min_inr,
      residential_partial_min_inr: budget.residential_partial_min_inr ?? DEFAULT_RULES_CONFIG.budget.residential_partial_min_inr,
      single_room_min_inr: budget.single_room_min_inr ?? DEFAULT_RULES_CONFIG.budget.single_room_min_inr,
      commercial_min_inr: budget.commercial_min_inr ?? DEFAULT_RULES_CONFIG.budget.commercial_min_inr,
    },
    commercial: {
      min_sqft: commercial.min_sqft ?? DEFAULT_RULES_CONFIG.commercial.min_sqft,
      large_sqft: commercial.large_flag_sqft ?? DEFAULT_RULES_CONFIG.commercial.large_sqft,
    },
    residential: { ...DEFAULT_RULES_CONFIG.residential },
    timeline: {
      min_lead_weeks: timeline.min_lead_weeks ?? DEFAULT_RULES_CONFIG.timeline.min_lead_weeks,
      tight_weeks: DEFAULT_RULES_CONFIG.timeline.tight_weeks,
      nurture_below_weeks: DEFAULT_RULES_CONFIG.timeline.nurture_below_weeks,
    },
  };

  const officeHours = (s.get('office_hours') as OfficeHours) ?? DEFAULT_OFFICE_HOURS;
  const sla = (s.get('sla') as AppSettings['sla']) ?? { claim_minutes: 15, escalate_minutes: 30, designer_call_minutes: 60 };
  const callbackWindow = (s.get('callback_window') as AppSettings['callbackWindow']) ?? { start: '09:00', end: '21:00', tz: 'Asia/Kolkata' };

  return {
    rules,
    officeHours,
    rates,
    sla,
    escalationCallbackMinutes: Number(s.get('escalation_callback_minutes') ?? 15),
    callbackWindow,
    afterHoursCallbackAt: (s.get('after_hours_callback_at') as string) ?? '09:00',
    maxOpenLeadsDefault: Number(s.get('max_open_leads_default') ?? 5),
    pipelineValueBand: (s.get('pipeline_value_band') as AppSettings['pipelineValueBand']) ?? { min_inr: 800000, max_inr: 1400000 },
  };
}
