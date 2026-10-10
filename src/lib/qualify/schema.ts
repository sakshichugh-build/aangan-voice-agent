import { z } from 'zod';

/**
 * Structured lead extracted from a call transcript by Claude (§6 of the brief).
 * This is the ONLY place the LLM's output shape is defined. The rules engine
 * consumes a validated object of this type; it never sees raw text.
 *
 * A few fields extend the brief's schema where the deterministic rules need a
 * signal that, in production, comes from a tool (e.g. is_repeat_caller is set by
 * lookup_caller live; in the transcript-only eval it is read from the dialogue).
 */
export const ExtractionSchema = z.object({
  intent: z.enum(['new_project', 'existing_client', 'other', 'dropped']),

  caller_name: z.string().nullable(),
  phone: z.string().nullable(),
  language: z.string().nullable(),

  project_type: z.enum([
    'residential_full',
    'residential_partial',
    'single_room',
    'commercial_office',
    'commercial_other',
    'out_of_scope_category',
    'unclear',
  ]),

  locality: z.string().nullable(),
  city: z.string().nullable(),
  in_service_area: z.enum(['yes', 'no', 'unclear']),

  carpet_area_sqft: z.number().nullable(),
  rooms_scope: z.array(z.string()).default([]),
  current_state: z.string().nullable(),
  is_rented: z.boolean().nullable(),

  wants_execution: z.enum(['yes', 'no', 'unclear']),

  timeline_text: z.string().nullable(),
  target_completion_date: z.string().nullable(),
  /** Weeks from the call date until the client's REQUIRED COMPLETION deadline.
   *  null when flexible / no deadline. Possession/site-availability timing does
   *  NOT count here (that is captured in current_state / timeline_text). */
  weeks_available: z.number().nullable(),

  budget_volunteered: z.boolean().default(false),
  budget_inr_min: z.number().nullable(),
  budget_inr_max: z.number().nullable(),

  decision_maker: z.enum(['yes', 'represented_authorised', 'no', 'unclear']),

  referral_source: z.string().nullable(),
  referral_name: z.string().nullable(),

  preferred_slots: z.array(z.string()).default([]),
  consultation_booked: z.boolean().default(false),
  booked_slot_id: z.string().nullable(),

  sentiment: z.enum(['positive', 'neutral', 'frustrated', 'angry']),
  asked_about_pricing: z.boolean().default(false),

  /** Extension: caller references a prior enquiry/contact (T16). Live: from lookup_caller. */
  is_repeat_caller: z.boolean().default(false),

  summary_for_designer: z.string(),
  open_questions_for_designer: z.array(z.string()).default([]),
  evidence: z.record(z.string(), z.string()).default({}),
});

export type Extraction = z.infer<typeof ExtractionSchema>;

/**
 * JSON Schema for Claude tool-use (input_schema of the `record_lead` tool).
 * Kept in sync with ExtractionSchema by hand — small and stable.
 */
export const EXTRACTION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    intent: { type: 'string', enum: ['new_project', 'existing_client', 'other', 'dropped'] },
    caller_name: { type: ['string', 'null'] },
    phone: { type: ['string', 'null'] },
    language: { type: ['string', 'null'], description: 'Primary language of the caller (e.g. English, Hindi, Marathi, Hinglish)' },
    project_type: {
      type: 'string',
      enum: ['residential_full', 'residential_partial', 'single_room', 'commercial_office', 'commercial_other', 'out_of_scope_category', 'unclear'],
      description: 'out_of_scope_category = restaurant/hotel/retail/gym/hospitality',
    },
    locality: { type: ['string', 'null'] },
    city: { type: ['string', 'null'] },
    in_service_area: { type: 'string', enum: ['yes', 'no', 'unclear'], description: 'yes if Pune city or PCMC (incl. Kharadi, Hadapsar, etc.); no if Talegaon/Lonavala/Nashik/Mumbai/other cities; unclear if no location given' },
    carpet_area_sqft: { type: ['number', 'null'] },
    rooms_scope: { type: 'array', items: { type: 'string' } },
    current_state: { type: ['string', 'null'], description: 'e.g. bare shell, builder finish, lived-in, new possession, rented' },
    is_rented: { type: ['boolean', 'null'] },
    wants_execution: { type: 'string', enum: ['yes', 'no', 'unclear'], description: 'no if they only want advice/ideas/consultation without execution' },
    timeline_text: { type: ['string', 'null'] },
    target_completion_date: { type: ['string', 'null'] },
    weeks_available: { type: ['number', 'null'], description: 'Weeks from the call date until the REQUIRED COMPLETION deadline. null if flexible/no rush/no deadline. Do NOT count possession or site-availability timing here.' },
    budget_volunteered: { type: 'boolean' },
    budget_inr_min: { type: ['number', 'null'], description: 'In rupees, e.g. 1 lakh = 100000' },
    budget_inr_max: { type: ['number', 'null'], description: 'In rupees, e.g. 1.5 lakh = 150000' },
    decision_maker: { type: 'string', enum: ['yes', 'represented_authorised', 'no', 'unclear'], description: "yes = caller decides; represented_authorised = caller explicitly authorised to proceed on an owner's behalf; no = caller is only researching / not the decision maker; unclear otherwise" },
    referral_source: { type: ['string', 'null'], description: 'e.g. friend of Nikhil, past client, Instagram, LinkedIn' },
    referral_name: { type: ['string', 'null'] },
    preferred_slots: { type: 'array', items: { type: 'string' } },
    consultation_booked: { type: 'boolean' },
    booked_slot_id: { type: ['string', 'null'] },
    sentiment: { type: 'string', enum: ['positive', 'neutral', 'frustrated', 'angry'] },
    asked_about_pricing: { type: 'boolean' },
    is_repeat_caller: { type: 'boolean', description: 'true if the caller references a prior enquiry/call that was not followed up' },
    summary_for_designer: { type: 'string', description: '3–5 plain lines a designer can read before calling' },
    open_questions_for_designer: { type: 'array', items: { type: 'string' } },
    evidence: { type: 'object', additionalProperties: { type: 'string' }, description: 'field name → short verbatim quote from the transcript supporting it' },
  },
  required: [
    'intent', 'project_type', 'in_service_area', 'wants_execution',
    'decision_maker', 'sentiment', 'summary_for_designer',
  ],
  additionalProperties: false,
} as const;
