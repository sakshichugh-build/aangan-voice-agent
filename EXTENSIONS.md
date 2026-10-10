# Extending to WhatsApp and Web Form (design only — not built)

Phone is the only channel in scope for the MVP, but the data model and provider
interfaces were built so these channels drop in without a rewrite.

## What's already in place
- **`leads.channel`** column (`phone` | `whatsapp` | `web`) with a unique index on
  `(channel, phone)` — a person can exist per channel, and WhatsApp/web leads slot
  in beside phone leads.
- **Provider interfaces** mirror each other: `VoiceProvider` (`src/lib/voice/`),
  `EmailProvider` (`src/lib/notify/`), `LlmProvider` (`src/lib/llm/`). A
  `ChannelProvider` for chat/forms follows the same shape.
- **The P2–P5 pipeline is channel-agnostic.** `runPostCallPipeline` works off a
  stored "interaction" (call + transcript today). Chat threads and form
  submissions become the same kind of record; everything downstream — extraction,
  rules engine, guardrails, cost ledger, handoff, SLA — is unchanged.

## A `ChannelProvider` interface (parallel to VoiceProvider)
```ts
interface ChannelProvider {
  name: string;
  verifyWebhook(req, rawBody): boolean;
  parseInbound(payload): NormalizedMessageEvent | null; // → thread id, text, sender
  sendReply?(threadId, text): Promise<void>;            // for interactive channels
}
```
Store inbound messages in a `messages` table (FK `lead_id`, `channel`,
`thread_id`, `direction`, `body`, `sent_at`). A thread maps to one lead; the
"transcript" fed to extraction is the concatenated thread.

## WhatsApp
- Use the **WhatsApp Business API** (Meta Cloud API or a BSP). Register a number,
  verify the webhook, store the `thread_id` = WhatsApp conversation id.
- **24-hour session rule**: outside the 24h customer-service window you can only
  send **approved message templates**, not free text. So:
  - Within 24h of the caller's last message → reply freely (the agent converses,
    qualifies, books, deflects pricing with the same fixed line).
  - Outside 24h → send a pre-approved template (e.g. "Your consultation is
    confirmed for …") to re-open, then continue.
- Run the **same agent prompt** (persona, five criteria, pricing deflection) as a
  text agent. The same `book_consultation` / `escalate` tools apply.
- Extraction runs on the whole thread when it goes quiet (e.g. 10 min idle) or on
  an explicit "book me" — then rules/guardrails/handoff as normal.
- Patterns to expect (from the seed WhatsApp threads W02, W05, W08): pricing-first
  messages and after-hours arrival — handled identically to phone.

## Web form
- A form POSTs to `/api/web/submit`. Forms give us **structured fields already**,
  so the pipeline **skips extraction for filled fields** and only uses the LLM to
  classify free-text ("message") and fill gaps. Run the rules engine directly on
  the structured fields → faster and cheaper than a transcript.
- Same handoff note and SLA. The confirmation is an email/WhatsApp auto-reply.
- Seed form submissions F03 (out of area), F04/F07 (pricing-first, after-hours)
  exercise the same decline/deflection paths.

## Dashboard
- Everything already keys off `leads`/qualifications/handoffs, so the dashboard
  works unchanged. Add a **per-channel filter** (phone / WhatsApp / web) on the
  Overview and Inbox, and a channel column in the inbox table.
- Cost ledger gains WhatsApp message costs (template vs session) as a new
  `source`; the same per-lead/per-booked math applies.

## Order of work
1. `messages` table + `ChannelProvider` + `/api/web/submit` (web is simplest —
   no session rules). 2. WhatsApp Business API + templates. 3. Per-channel
   dashboard filters.
