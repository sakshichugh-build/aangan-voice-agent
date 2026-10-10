/**
 * Configures the Vaani agent's PERSONA via the Vaani API (system prompt + greeting
 * + language). Tools (cURL-paste) and the webhook (Settings → Webhooks) are UI-only
 * in Vaani, so this script does the part the API supports.
 *
 *   VAANI_API_KEY=vaani_… VAANI_AGENT_ID=<id> npm run vaani:configure
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const KEY = process.env.VAANI_API_KEY;
const AGENT_ID = process.env.VAANI_AGENT_ID ?? 'b22de38e-bd93-4ca9-954f-1aa5304d6f46';
const BASE = process.env.VAANI_BASE_URL ?? 'https://api.vaanivoice.ai';
if (!KEY) { console.error('Set VAANI_API_KEY (vaani_…)'); process.exit(1); }

const GREETING = 'Namaste, Aangan Studio — how can I help you today?';

async function main() {
  const systemPrompt = readFileSync(join(process.cwd(), 'src', 'lib', 'voice', 'agent-prompt.md'), 'utf8');

  const body = {
    identity: {
      system_prompt: systemPrompt,
      greeting_message: { agent_message: GREETING, interruptible: true },
    },
    senses_capabilities: { language: 'en' },
  };

  const url = `${BASE}/api/agent/${AGENT_ID}/persona`;
  console.log(`PATCH ${url}`);
  const headers: Record<string, string> = { 'X-API-Key': KEY!, 'Content-Type': 'application/json' };
  const res = await fetch(url, { method: 'PATCH', headers, body: JSON.stringify(body) });
  const text = await res.text();
  console.log(`HTTP ${res.status}`);
  console.log(text.slice(0, 1200));
  if (!res.ok) process.exit(1);
  console.log('\n✅ Persona updated: system prompt + greeting + language set.');
  console.log('Next (Vaani UI): paste the 4 tool cURLs, and add the webhook URL in Settings → Webhooks.');
}

main().catch((e) => { console.error(e); process.exit(1); });
