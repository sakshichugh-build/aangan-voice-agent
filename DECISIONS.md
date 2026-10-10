# Decisions Log

Non-obvious engineering choices and why. Newest first.

## Phase 1 — Scaffold

### Reused the existing Supabase project; migrations via Management API
The account is a **member of a managed org** (`mesaschool.co`) it doesn't own, so
the Management API returns `Forbidden` on project creation and an empty org list.
We therefore **restored and reused** the existing (paused) project
`pagwanhxouvxibmjtnzz` (Tokyo / ap-northeast-1) rather than deleting it or
creating a new one. Latency from Pune is fine (~100 ms) and the voice path runs
through Vaani regardless. Migrations + seed are applied through the Management API
**query endpoint** (`/v1/projects/{ref}/database/query`, runs as `postgres`), which
avoids needing the project's DB password — see `scripts/db-migrate.ts`.

### Deploy target
GitHub: `sakshichugh-build/aangan-voice-agent`. Vercel project
`aangan-voice-agent` (team `sakshi-c-mesa`), production
`https://aangan-voice-agent-amber.vercel.app`. Production is public (webhooks,
cron, designer action links need that); Vercel Authentication only gates preview
URLs. `cron_config` in Supabase holds the base URL + cron secret so pg_cron can
reach the app.


### Email for designer handoff (founder's decision)
The brief argued for Telegram, but **Nikhil chose email** (2026-10-10). We keep
the benefits Telegram would have given us:
- **One-tap claim + outcome** is preserved with **tokenized action links** in the
  email ("Claim", "Called – booked", "No answer", "Not a fit"). Each handoff row
  carries a secret `action_token`; clicking a link hits `/handoff/<token>/<action>`,
  records it (no login needed), and shows a confirmation page. This still gives us
  the **time-to-claim** metric and lets the SLA re-ping/escalation crons run.
- **Supabase remains the system of record**; email is only the delivery channel.
Default provider: **Resend** (clean API, Vercel-native, verified-domain sending).
Delivery is abstracted so we could swap providers or re-add Telegram later
(`handoffs.delivery_channel`). Escalation and error alerts also go by email.

### AI extracts, code decides
The LLM (Claude) only turns the transcript into structured JSON. The
**qualification outcome is computed by a deterministic, unit-tested TypeScript
rules engine** (`src/lib/qualify/rules.ts`) implementing `qualified.md` exactly.
Every decision stores a `rule_trace` for audit. This keeps outcomes explainable
and stable, and lets us eval against T01–T20 without LLM nondeterminism in the
decision step.

### pricing.md is never given to the agent
Per the brief: "the agent can't leak what it doesn't have." `pricing.md` is NOT
loaded into the voice agent prompt or tools. The only pricing response is the
fixed deflection line. A post-call guardrail (regex + Claude second check) scans
every transcript for leaks and flags violations on the dashboard + Telegram.

### Scheduling via Supabase pg_cron + pg_net, not Vercel cron
Vercel Hobby crons are daily-only — too coarse for 15-min SLA re-pings and
≤5-min callbacks. Supabase `pg_cron` ticks every minute and `pg_net` POSTs to
`/api/cron/*`. Base URL + shared secret live in a `cron_config` row filled after
deploy, so no secret is hard-coded. Cron routes are guarded by `x-cron-secret`.

### Enum-like columns as TEXT + CHECK
Postgres native enums are painful to evolve in migrations. We use `text` columns
with `CHECK` constraints for outcomes/statuses — same safety, easy to extend.

### RLS: service role writes, users read
All pipeline/webhook/cron writes use the **service role (bypasses RLS)**.
Dashboard reads use the user's session: founder/front_desk read all operational
tables; designers read only their own handoffs and the lead/call behind them.
Dashboard mutations go through server actions using the service role after an
explicit role check, so no user-facing write policies are granted (default-deny).

### Data model is channel-aware from day one
`leads.channel` and a `VoiceProvider` interface (`src/lib/voice/`) mean the same
P2–P5 pipeline can later serve WhatsApp/web without a rewrite (see EXTENSIONS.md).

### Model: claude-sonnet-5-5 for extraction
"claude-sonnet tier" per the brief; configurable via `ANTHROPIC_MODEL`.
