/**
 * One-off: remove manual sequence_subscriptions that are redundant
 * because the customer is already in the sequence via the list filter.
 *
 * Usage: npx tsx scripts/cleanup-duplicate-subscriptions.ts
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

import { cleanupRedundantSubscriptions } from '@/lib/db';

async function main() {
  const result = await cleanupRedundantSubscriptions();
  console.log(`Deleted ${result.deleted} redundant subscription${result.deleted === 1 ? '' : 's'}.`);
  if (result.byCustomer.length > 0) {
    console.log('\nBreakdown:');
    for (const b of result.byCustomer) {
      console.log(`  • signup=${b.signupId} sequence="${b.sequenceName}"`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
