/**
 * Applies SQL migrations (supabase/migrations/*.sql) and the seed (supabase/seed.sql)
 * via the Supabase Management API query endpoint (runs as postgres). No DB password
 * required — uses SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF.
 *
 * Idempotent: migrations guarded by a _migrations ledger; seed is itself idempotent
 * and always re-runs.
 *
 *   SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=... npm run db:migrate
 *   ... npm run db:migrate -- --seed-only
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF;
if (!TOKEN || !REF) {
  console.error('Set SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF.');
  process.exit(1);
}

const ROOT = join(process.cwd(), 'supabase');
const MIGRATIONS_DIR = join(ROOT, 'migrations');
const SEED_FILE = join(ROOT, 'seed.sql');
const seedOnly = process.argv.includes('--seed-only');
const API = `https://api.supabase.com/v1/projects/${REF}/database/query`;

async function run(query: string): Promise<unknown> {
  const res = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 600)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function main() {
  console.log(`project ${REF} — applying via Management API`);
  await run(`create table if not exists _migrations (
    name text primary key, applied_at timestamptz not null default now())`);

  if (!seedOnly) {
    const applied = (await run('select name from _migrations')) as { name: string }[];
    const done = new Set(applied.map((r) => r.name));
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
    for (const f of files) {
      if (done.has(f)) {
        console.log(`• skip   ${f} (already applied)`);
        continue;
      }
      process.stdout.write(`▸ apply  ${f} ... `);
      try {
        await run(readFileSync(join(MIGRATIONS_DIR, f), 'utf8'));
        await run(`insert into _migrations(name) values('${f}') on conflict do nothing`);
        console.log('ok');
      } catch (e) {
        console.log('FAILED');
        console.error(e instanceof Error ? e.message : e);
        process.exit(1);
      }
    }
  }

  process.stdout.write('▸ seed   supabase/seed.sql ... ');
  try {
    await run(readFileSync(SEED_FILE, 'utf8'));
    console.log('ok');
  } catch (e) {
    console.log('FAILED');
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }

  const counts = (await run(
    `select 'service_areas' t, count(*) n from service_areas
     union all select 'designers', count(*) from designers
     union all select 'consultation_slots', count(*) from consultation_slots
     union all select 'rates', count(*) from rates
     union all select 'settings', count(*) from settings
     order by t`,
  )) as { t: string; n: number }[];
  for (const r of counts) console.log(`  ${r.t.padEnd(20)} ${r.n}`);
  console.log('done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
