# Aangan Studio — "Never-Miss" Phone Enquiry Agent

Answers every studio phone call 24×7, qualifies the caller against Nikhil's rubric,
books a consultation, and sends the assigned designer a complete handoff note by
email within minutes — so no enquiry is ever missed and no designer re-asks what
was already asked. The agent **never quotes a price.**

- **Stack:** Next.js (App Router, TS) on Vercel · Supabase (Postgres, Auth,
  pg_cron) · **Gemini** for post-call extraction (behind a provider interface;
  the brief specified Claude — see `DECISIONS.md`) · **email** for designer
  handoff (founder's choice) · Vaani for the voice layer (Phase 4).
- **Live:** https://aangan-voice-agent-amber.vercel.app
- **Core principle:** *AI extracts, code decides.* The LLM only turns a transcript
  into structured JSON; a deterministic, unit-tested rules engine decides the
  outcome and records a full audit trace.

## How it works

```
Call → Vaani agent (24×7) ──call.ended──▶ /api/voice/webhook  (P1 store)
                                              │ enqueue job
                         pg_cron every minute ▼
                                   /api/cron/process-jobs
   P2 extract (Gemini→JSON, Zod, retry once)
   P3 rules engine (qualified.md) → outcome + flags + rule_trace
   P4 guardrails (pricing-leak scan)
   P5 cost ledger (tokens + minutes → ₹)
        └─▶ route: QUALIFIED → email handoff (one-tap Claim/Booked/No-answer/Not-a-fit)
                    NURTURE → follow-up task · ESCALATION → senior alert
                    CALLBACK_NEEDED → outbound/task · DECLINED/NOT_A_LEAD → logged
   SLA crons re-ping unclaimed leads → escalate to front desk + Nikhil.
```

Dashboard (founder/front desk): Overview · Cost · Inbox · Lead detail · Guardrails
· Settings. Designers don't use the dashboard — they act from the email links.

## Build status
1. **Scaffold** ✅ — schema + RLS + seed, auth, deployed.
2. **Brain** ✅ — extraction, rules engine, guardrails, cost ledger, eval
   (**19–20/20 outcomes, 0 pricing leaks**).
3. **Email handoff** ✅ — note + tokenized action links, SLA crons, escalations.
4. **Voice (Vaani)** ⏳ — adapter/webhook/tools scaffolded behind `VoiceProvider`;
   needs Vaani account + docs to finish.
5. **Dashboard** ✅ — all pages.
6. **Hardening** ✅ — retries, reconcile cron, quota deferral, dead-letter alerts,
   this runbook, cost model.

## Setup
1. `npm install`
2. Copy `.env.example` → `.env.local` and fill it (Supabase keys are set by the
   provisioning scripts; add `GEMINI_API_KEY`, `RESEND_API_KEY`, alert emails,
   and Vaani keys as you reach each phase).
3. **Migrations + seed:** `SUPABASE_ACCESS_TOKEN=… SUPABASE_PROJECT_REF=… npm run db:migrate`
   (applies `supabase/migrations/*` + `supabase/seed.sql` via the Management API).
4. **Dev:** `npm run dev` · **Tests:** `npm test` · **Eval:** `npm run eval`
   (cached; `npm run eval -- --fresh` re-extracts via the LLM).
5. **Deploy:** `vercel deploy --prod`. After the first deploy, set the app URL +
   cron secret in Supabase: `update cron_config set base_url='https://…', cron_secret='…' where id=1;`

## Runbook — what to do if the agent goes down
- **Vaani can't reach us** (`/api/voice/webhook` 5xx): Vaani keeps running on its
  own prompt; the **reconcile cron** (`/api/cron/reconcile`, every 5 min) re-pulls
  settled calls and re-enqueues processing once we're back. No data lost.
- **Extraction failing** (LLM down / **daily quota hit**): jobs are **deferred**
  (not failed) on quota/429 and retried hourly until the window resets — leads are
  never dropped. Persistent hard failures become `NEEDS_REVIEW` with a front-desk
  task, and a dead-lettered job **emails Nikhil**.
- **Designer not claiming:** SLA cron re-pings at 15 min, escalates to front desk
  + Nikhil at 30 min. See the **Guardrails** page for unclaimed leads.
- **Pricing leak suspected:** the Guardrails page lists every flagged line; Nikhil
  is emailed on detection. `pricing.md` is never sent to the agent.
- **Crons not firing:** check `cron_config` (base_url/cron_secret/enabled) and
  `select * from cron.job`. Routes require the `x-cron-secret` header.
- **Rotate a secret:** update Vercel env + `cron_config.cron_secret`, redeploy.

## Cost model (at 200 calls/month)
Rates live in the editable `rates` table — these are the seeded placeholders;
confirm Vaani's real per-minute rate.

| Item | Maths | ₹/month |
|---|---|---|
| Vaani minutes | ~4 min × 200 = 800 min × ₹6/min | **₹4,800** |
| Gemini input | ~2,000 tok × 200 = 400k × $0.30/1M × ₹88 | ₹11 |
| Gemini output | ~440 tok × 200 = 88k × $2.50/1M × ₹88 | ₹19 |
| Email (Resend free ≤3k/mo) | — | ₹0 |
| Supabase + Vercel (free/hobby) | — | ₹0 |
| **Total** | | **≈ ₹4,830** |

- **Per call ≈ ₹24 · per qualified lead ≈ ₹60** (at ~40% qualified).
- Dominated entirely by Vaani minutes; the LLM is ~₹30/month (negligible).
- vs a front-desk cost-equivalent (configurable, seeded ₹40,000/mo) the system is
  ~12% of the cost — and it never sleeps. One recovered ₹8–14L project pays for
  years of runtime.
- The dashboard **Cost** page shows the live version of this from actual logged
  tokens and minutes.

## Known constraints
- **Gemini free tier = 20 requests/day** on the only model this key can use. Fine
  for ~7 calls/day average; spiky days defer extraction to the next window (leads
  are queued, not lost). Enable billing on the Gemini project to remove the cap
  for true 24×7 reliability.
- Vaani (Phase 4) not yet connected — the pipeline, handoff, dashboard and eval
  all run today via the transcript path (`/api/dev/simulate-call`).

See `DECISIONS.md` for why each non-obvious choice was made.
