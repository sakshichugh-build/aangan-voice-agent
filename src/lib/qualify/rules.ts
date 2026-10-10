import type { Extraction } from './schema';
import { DEFAULT_RULES_CONFIG, RULES_VERSION, type RulesConfig } from './config';

/** Deterministic outcomes. AI extracts, code decides. */
export type Outcome =
  | 'QUALIFIED'
  | 'QUALIFIED_FLAGGED'
  | 'NURTURE'
  | 'DECLINED'
  | 'ESCALATION'
  | 'CALLBACK_NEEDED'
  | 'NEEDS_REVIEW'
  | 'NOT_A_LEAD';

export type Flag =
  | 'VIP'
  | 'DECISION_MAKER_UNCLEAR'
  | 'BUDGET_UNCLEAR'
  | 'TIGHT_TIMELINE'
  | 'REPEAT_CALLER'
  | 'FRUSTRATED'
  | 'LARGE_PROJECT'
  | 'PRICING_ASKED';

export interface RuleTraceEntry {
  criterion: string;
  status: 'pass' | 'fail' | 'unclear' | 'flag' | 'na';
  detail: string;
}

export interface QualificationResult {
  outcome: Outcome;
  decline_reason: string | null;
  flags: Flag[];
  rule_trace: RuleTraceEntry[];
  follow_up_date: string | null; // for NURTURE
  rules_version: string;
}

function minBudgetForScope(projectType: Extraction['project_type'], cfg: RulesConfig): number | null {
  switch (projectType) {
    case 'residential_full':
      return cfg.budget.residential_full_min_inr;
    case 'residential_partial':
      return cfg.budget.residential_partial_min_inr;
    case 'single_room':
      return cfg.budget.single_room_min_inr;
    case 'commercial_office':
    case 'commercial_other':
      return cfg.budget.commercial_min_inr;
    default:
      return null;
  }
}

const VIP_REFERRAL_RE = /nikhil|founder|owner'?s friend|principal/i;

/**
 * Apply qualified.md deterministically to an extracted lead.
 * Pure function — same input always yields the same outcome (for the eval).
 */
export function qualify(
  ex: Extraction,
  config: RulesConfig = DEFAULT_RULES_CONFIG,
): QualificationResult {
  const trace: RuleTraceEntry[] = [];
  const flags = new Set<Flag>();
  const declineReasons: string[] = [];
  let timelineTooShort = false;
  let followUpDate: string | null = null;

  const add = (criterion: string, status: RuleTraceEntry['status'], detail: string) =>
    trace.push({ criterion, status, detail });

  // ---- Step 0: intent routing -------------------------------------------
  if (ex.intent === 'dropped') {
    add('intent', 'na', 'Dropped/missed call with no usable content');
    return finalize('CALLBACK_NEEDED', null, flags, trace, null);
  }
  if (ex.intent === 'existing_client') {
    add('intent', 'na', 'Existing-client matter → escalation path');
    if (ex.sentiment === 'frustrated' || ex.sentiment === 'angry') flags.add('FRUSTRATED');
    return finalize('ESCALATION', 'existing_client_complaint', flags, trace, null);
  }
  if (ex.intent === 'other') {
    add('intent', 'na', 'Vendor / job-seeker / spam — not a lead');
    return finalize('NOT_A_LEAD', 'not_a_lead', flags, trace, null);
  }
  add('intent', 'pass', 'New project enquiry');

  // ---- Criterion 1: real project with execution --------------------------
  if (ex.project_type === 'out_of_scope_category') {
    declineReasons.push('out_of_scope_category');
    add('1_real_project', 'fail', 'Out-of-scope category (restaurant/hotel/retail/gym)');
  } else if (ex.wants_execution === 'no') {
    declineReasons.push('advice_only');
    add('1_real_project', 'fail', 'Advice/ideas only — no execution (min engagement is redesign + execution)');
  } else if (ex.wants_execution === 'unclear') {
    add('1_real_project', 'unclear', 'Execution intent unclear');
  } else {
    add('1_real_project', 'pass', 'Wants design + execution');
  }

  // ---- Criterion 2: service area ----------------------------------------
  if (ex.in_service_area === 'no') {
    declineReasons.push('out_of_area');
    add('2_service_area', 'fail', `Outside service area${ex.city ? ` (${ex.city})` : ''}`);
  } else if (ex.in_service_area === 'unclear') {
    add('2_service_area', 'unclear', 'Location unclear — would ask one direct question live');
  } else {
    add('2_service_area', 'pass', 'Pune city / PCMC');
  }

  // ---- Scope/size (commercial min + large flags) ------------------------
  const isCommercial = ex.project_type === 'commercial_office' || ex.project_type === 'commercial_other';
  if (isCommercial && ex.carpet_area_sqft != null && ex.carpet_area_sqft < config.commercial.min_sqft) {
    declineReasons.push('commercial_too_small');
    add('scope_size', 'fail', `Commercial ${ex.carpet_area_sqft} sq ft < minimum ${config.commercial.min_sqft}`);
  } else if (isCommercial && ex.carpet_area_sqft != null && ex.carpet_area_sqft > config.commercial.large_sqft) {
    flags.add('LARGE_PROJECT');
    add('scope_size', 'flag', `Large commercial (${ex.carpet_area_sqft} sq ft) → route to Nikhil`);
  } else {
    // Residential LARGE_PROJECT (route to principal + copy Nikhil)
    const bigBySqft = ex.carpet_area_sqft != null && ex.carpet_area_sqft >= config.residential.large_sqft;
    const bigByRooms = (ex.rooms_scope?.length ?? 0) >= config.residential.large_bhk;
    const villaish = /villa|bungalow|duplex|row ?house/i.test(
      `${ex.project_type} ${ex.current_state ?? ''} ${ex.summary_for_designer ?? ''} ${ex.timeline_text ?? ''}`,
    );
    if (!isCommercial && (bigBySqft || villaish || bigByRooms)) {
      flags.add('LARGE_PROJECT');
      add('scope_size', 'flag', 'Large residential project → principal designer + copy Nikhil');
    } else {
      add('scope_size', 'pass', 'Within normal scope');
    }
  }

  // ---- Criterion 3: realistic timeline ----------------------------------
  const wk = ex.weeks_available;
  if (wk == null) {
    add('3_timeline', 'pass', 'Flexible / no hard deadline');
  } else if (wk < config.timeline.nurture_below_weeks) {
    timelineTooShort = true;
    add('3_timeline', 'fail', `Only ~${wk} weeks to completion — too short to design + execute`);
    // A later start usually works → nurture with a follow-up note.
    followUpDate = ex.target_completion_date ?? null;
  } else if (wk <= config.timeline.tight_weeks) {
    flags.add('TIGHT_TIMELINE');
    add('3_timeline', 'flag', `~${wk} weeks — doable but tight`);
  } else {
    add('3_timeline', 'pass', `~${wk} weeks — comfortable`);
  }

  // ---- Criterion 4: budget (soft; fails only if volunteered & clearly below)
  if (ex.budget_volunteered) {
    const minForScope = minBudgetForScope(ex.project_type, config);
    const stated = ex.budget_inr_max ?? ex.budget_inr_min;
    if (minForScope != null && stated != null && stated < minForScope) {
      declineReasons.push('budget_misaligned');
      add('4_budget', 'fail', `Volunteered ₹${stated} clearly below ₹${minForScope} for scope`);
    } else if (minForScope == null || stated == null) {
      flags.add('BUDGET_UNCLEAR');
      add('4_budget', 'unclear', 'Budget volunteered but not comparable to scope');
    } else {
      add('4_budget', 'pass', 'Volunteered budget broadly OK');
    }
  } else {
    add('4_budget', 'na', 'Not volunteered — treat as qualified (do not probe)');
  }

  // ---- Criterion 5: decision maker (soft; never declines, only flags) ----
  if (ex.decision_maker === 'yes' || ex.decision_maker === 'represented_authorised') {
    add('5_decision_maker', 'pass', 'Decision maker or authorised representative');
  } else {
    flags.add('DECISION_MAKER_UNCLEAR');
    add('5_decision_maker', 'flag', 'Caller may not be the decision maker — flag, do not push');
  }

  // ---- Non-criterion flags ----------------------------------------------
  if (ex.asked_about_pricing) {
    flags.add('PRICING_ASKED');
    add('pricing_asked', 'flag', 'Asked about pricing (never disqualifies)');
  }
  if (ex.is_repeat_caller) {
    flags.add('REPEAT_CALLER');
    add('repeat_caller', 'flag', 'Prior enquiry not followed up — fast-track');
  }
  if (ex.sentiment === 'frustrated' || ex.sentiment === 'angry') {
    flags.add('FRUSTRATED');
    add('sentiment', 'flag', `Caller ${ex.sentiment} — handle with care`);
  }
  const referralBlob = `${ex.referral_source ?? ''} ${ex.referral_name ?? ''}`;
  if (VIP_REFERRAL_RE.test(referralBlob)) {
    flags.add('VIP');
    add('vip', 'flag', 'Referral connected to the founder → VIP');
  }

  // ---- Decision assembly ------------------------------------------------
  const declineFails = declineReasons.filter((r) => r !== 'timeline');
  const totalFails = declineFails.length + (timelineTooShort ? 1 : 0);

  // Any decline-worthy fail → DECLINED. 2+ fails → DECLINED (subsumed).
  if (declineFails.length >= 1) {
    const reason = declineFails[0];
    return finalize('DECLINED', reason, flags, trace, null, totalFails);
  }
  // Only timeline is the problem → nurture (a later start usually works).
  if (timelineTooShort) {
    return finalize('NURTURE', 'timeline_too_short', flags, trace, followUpDate);
  }

  // Qualified (flagged if any flags present)
  const outcome: Outcome = flags.size > 0 ? 'QUALIFIED_FLAGGED' : 'QUALIFIED';
  return finalize(outcome, null, flags, trace, null);
}

function finalize(
  outcome: Outcome,
  declineReason: string | null,
  flags: Set<Flag>,
  trace: RuleTraceEntry[],
  followUpDate: string | null,
  totalFails?: number,
): QualificationResult {
  if (totalFails != null && totalFails >= 2) {
    trace.push({ criterion: 'summary', status: 'fail', detail: `${totalFails} criteria failed → decline` });
  }
  // Canonical flag order for stable output
  const order: Flag[] = [
    'VIP', 'LARGE_PROJECT', 'PRICING_ASKED', 'TIGHT_TIMELINE',
    'DECISION_MAKER_UNCLEAR', 'BUDGET_UNCLEAR', 'REPEAT_CALLER', 'FRUSTRATED',
  ];
  const sorted = order.filter((f) => flags.has(f));
  return {
    outcome,
    decline_reason: declineReason,
    flags: sorted,
    rule_trace: trace,
    follow_up_date: followUpDate,
    rules_version: RULES_VERSION,
  };
}
