/**
 * Manually invoke the sequence cron logic against the live database
 * with the auth header. Useful for diagnosing whether the cron is
 * silently failing in production.
 *
 * Usage: npx tsx scripts/run-sequence-cron-now.ts
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
try {
  const envFile = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of envFile.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
} catch {}

const PROD_URL = process.env.PROD_URL || 'https://bosslabs.ai';

async function main() {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('CRON_SECRET not in .env.local');
    process.exit(1);
  }

  console.log(`Hitting ${PROD_URL}/api/cron/sequences ...`);
  const res = await fetch(`${PROD_URL}/api/cron/sequences`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const text = await res.text();
  console.log(`Status: ${res.status}`);
  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    console.log(text);
  }
}

main().catch(console.error);
