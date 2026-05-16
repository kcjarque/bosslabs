#!/usr/bin/env node
/**
 * One-shot Supabase scaffolder.
 *
 *   npm run db:scaffold
 *
 * Reads .env.local + supabase/migrations/0001_init.sql, then POSTs the SQL
 * to the Supabase Management API. Idempotent — safe to re-run.
 *
 * Required env (in .env.local or the shell):
 *   NEXT_PUBLIC_SUPABASE_URL      https://<projectref>.supabase.co
 *   SUPABASE_ACCESS_TOKEN         personal access token from
 *                                 https://supabase.com/dashboard/account/tokens
 *
 * If SUPABASE_ACCESS_TOKEN is missing, prints the SQL editor URL so you can
 * paste the migration manually (30-second fallback).
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvLocal() {
  const p = resolve(process.cwd(), '.env.local');
  if (!existsSync(p)) return;
  const raw = readFileSync(p, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m && process.env[m[1]] === undefined) {
      let value = m[2];
      // strip optional surrounding quotes
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[m[1]] = value;
    }
  }
}

loadEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

if (!SUPABASE_URL) {
  console.error('\n✗ NEXT_PUBLIC_SUPABASE_URL is not set in .env.local');
  console.error('  Get it from your Supabase dashboard → Settings → API → Project URL\n');
  process.exit(1);
}

const projectRef = (() => {
  try {
    return new URL(SUPABASE_URL).hostname.split('.')[0];
  } catch {
    return null;
  }
})();

if (!projectRef) {
  console.error(`\n✗ Could not extract project ref from "${SUPABASE_URL}"\n`);
  process.exit(1);
}

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/0001_init.sql',
);
if (!existsSync(migrationPath)) {
  console.error(`\n✗ Migration file not found: ${migrationPath}\n`);
  process.exit(1);
}
const sql = readFileSync(migrationPath, 'utf8');

if (!ACCESS_TOKEN) {
  const sqlUrl = `https://supabase.com/dashboard/project/${projectRef}/sql/new`;
  console.log(`
┌─ Manual path (fastest, ~30 seconds) ──────────────────────────────────────
│
│   1. Open your SQL editor:
│      ${sqlUrl}
│
│   2. Paste the migration:
│      supabase/migrations/0001_init.sql
│
│   3. Click Run.
│
└────────────────────────────────────────────────────────────────────────────

Or, to automate it: add SUPABASE_ACCESS_TOKEN to .env.local
(from https://supabase.com/dashboard/account/tokens) and re-run:

  npm run db:scaffold
`);
  process.exit(1);
}

console.log(`→ Scaffolding ${projectRef} via Supabase Management API…`);

try {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  const text = await res.text();
  if (!res.ok) {
    console.error(`\n✗ Failed (HTTP ${res.status}):\n${text}\n`);
    if (res.status === 401) {
      console.error(
        '  Your SUPABASE_ACCESS_TOKEN looks invalid. Re-issue at:',
      );
      console.error('  https://supabase.com/dashboard/account/tokens\n');
    }
    process.exit(1);
  }
  console.log('✓ Tables created, RLS enabled, templates + settings seeded.');
  console.log(
    `\nVerify in dashboard: https://supabase.com/dashboard/project/${projectRef}/editor`,
  );
} catch (err) {
  console.error('\n✗ Network or parse error:', err.message, '\n');
  process.exit(1);
}
