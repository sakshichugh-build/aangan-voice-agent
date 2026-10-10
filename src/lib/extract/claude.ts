import Anthropic from '@anthropic-ai/sdk';
import { env } from '@/lib/env';
import { ExtractionSchema, EXTRACTION_JSON_SCHEMA, type Extraction } from '@/lib/qualify/schema';

export const EXTRACTION_PROMPT_VERSION = 'extract-1.0.0';

export interface ExtractionResult {
  extraction: Extraction | null;
  valid: boolean;
  attempts: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
  rawText: string;
  error?: string;
}

const SYSTEM = `You convert a single Aangan Studio phone-enquiry transcript into one strict JSON object describing the lead. Aangan Studio is a Pune interior-design firm (residential + small commercial up to ~3,000 sq ft; no restaurants/hotels/retail/gyms; serves Pune city + PCMC only).

Rules:
- Output ONLY a single minified JSON object. No prose, no markdown, no code fences.
- Use exactly the field names and enum values given. Use null for unknown scalars, [] for unknown arrays.
- in_service_area: "yes" for Pune city or PCMC localities (Kothrud, Baner, Aundh, Wakad, Koregaon Park, Kalyani Nagar, Viman Nagar, Hadapsar, Magarpatta, NIBM, Kondhwa, Undri, Warje, Erandwane, Deccan, Kharadi, Pimpri, Chinchwad, Pimple Saudagar/Nilakh, Ravet, Hinjewadi, and other Pune areas). "no" for Talegaon, Lonavala, Nashik, Mumbai, or other cities. "unclear" if no location was given.
- project_type: residential_full (whole home / 2BHK+), residential_partial (a floor or 2+ rooms), single_room, commercial_office, commercial_other (clinic/studio), out_of_scope_category (restaurant/hotel/retail/gym/hospitality), or unclear.
- wants_execution: "no" if they only want ideas/advice/consultation without execution; else "yes".
- weeks_available: integer weeks from the CALL DATE (in the transcript header) until the client's REQUIRED COMPLETION deadline. null if flexible / "no rush" / no deadline stated. IMPORTANT: possession or site-availability timing (e.g. "possession in 6 weeks") is NOT a completion deadline — leave weeks_available null in that case and note the possession timing in current_state. Use any explicit timing the transcript states (e.g. if the front desk says "about three weeks away", use 3).
- budget_volunteered: true only if the CALLER volunteered a budget number. budget_inr_min/max in rupees (1 lakh = 100000).
- decision_maker: "yes" (caller decides), "represented_authorised" (caller explicitly authorised to proceed for an owner), "no" (caller is only researching / not the decision maker, e.g. doing initial checking for parents), "unclear".
- asked_about_pricing: true if the caller asked about price/cost/rates/ballpark.
- is_repeat_caller: true if the caller says they contacted before and it was not followed up.
- referral_source: note the source; if the referral is connected to the founder (e.g. "friend of Nikhil"), say so explicitly.
- intent: "dropped" for a missed/dropped call with no usable content; "existing_client" for a current client's complaint/query about an ongoing project; "other" for vendor/job-seeker/spam; else "new_project".
- summary_for_designer: 3–5 plain lines a designer can read before calling. evidence: map a few key field names to a short verbatim quote from the transcript.

The JSON must match this schema (types/enums):
${JSON.stringify(EXTRACTION_JSON_SCHEMA)}`;

function stripToJson(text: string): string {
  let t = text.trim();
  // Strip markdown fences if the model added them despite instructions.
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  // Grab the outermost JSON object.
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first >= 0 && last > first) t = t.slice(first, last + 1);
  return t;
}

/**
 * Extract a structured lead from a transcript via Claude. Validates with Zod and
 * retries once on invalid output. Returns token usage for the cost ledger.
 */
export async function extractLead(transcript: string): Promise<ExtractionResult> {
  const client = new Anthropic({ apiKey: env.anthropicApiKey() });
  const model = env.anthropicModel();

  let inputTokens = 0;
  let outputTokens = 0;
  let rawText = '';
  let lastError = '';

  for (let attempt = 1; attempt <= 2; attempt++) {
    const userContent =
      attempt === 1
        ? `Transcript:\n\n${transcript}`
        : `Transcript:\n\n${transcript}\n\nYour previous reply was not valid against the schema (${lastError}). Reply again with ONLY the corrected minified JSON object.`;

    const res = await client.messages.create({
      model,
      max_tokens: 2000,
      output_config: { effort: 'low' },
      system: SYSTEM,
      messages: [{ role: 'user', content: userContent }],
    });

    inputTokens += res.usage.input_tokens ?? 0;
    outputTokens += res.usage.output_tokens ?? 0;

    const textBlock = res.content.find((b) => b.type === 'text');
    rawText = textBlock && 'text' in textBlock ? textBlock.text : '';

    try {
      const parsed = JSON.parse(stripToJson(rawText));
      const result = ExtractionSchema.safeParse(parsed);
      if (result.success) {
        return { extraction: result.data, valid: true, attempts: attempt, model, inputTokens, outputTokens, rawText };
      }
      lastError = result.error.issues
        .slice(0, 6)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
    } catch (e) {
      lastError = e instanceof Error ? e.message : 'JSON parse error';
    }
  }

  return { extraction: null, valid: false, attempts: 2, model, inputTokens, outputTokens, rawText, error: lastError };
}
