/**
 * Thresholds for the rules engine. Defaults mirror the seeded `settings` rows;
 * at runtime we load overrides from the DB so Nikhil can tune them in Settings
 * without a deploy. Never surfaced to callers.
 */
export interface RulesConfig {
  budget: {
    residential_full_min_inr: number;
    residential_partial_min_inr: number;
    single_room_min_inr: number;
    commercial_min_inr: number;
  };
  commercial: {
    min_sqft: number; // below this → decline
    large_sqft: number; // above this → flag LARGE_PROJECT (don't decline)
  };
  residential: {
    large_sqft: number; // at/above → LARGE_PROJECT
    large_bhk: number; // rooms count at/above → LARGE_PROJECT
  };
  timeline: {
    min_lead_weeks: number; // can't execute if ready needed sooner
    tight_weeks: number; // <= this (and >= nurture cutoff) → TIGHT_TIMELINE flag
    nurture_below_weeks: number; // < this → timeline too short → NURTURE
  };
}

export const DEFAULT_RULES_CONFIG: RulesConfig = {
  budget: {
    residential_full_min_inr: 300000,
    residential_partial_min_inr: 250000,
    single_room_min_inr: 200000,
    commercial_min_inr: 300000,
  },
  commercial: { min_sqft: 500, large_sqft: 3000 },
  residential: { large_sqft: 2000, large_bhk: 4 },
  timeline: { min_lead_weeks: 6, tight_weeks: 11, nurture_below_weeks: 8 },
};

export const RULES_VERSION = 'rules-1.0.0';
