/**
 * One-time cleanup: nl_d01..nl_d60 subjects were loaded verbatim from the
 * source doc's internal "Day N · " day-labels, which leaked into the live
 * subject line customers see in their inbox. Strips that prefix, keeping
 * the actual hook line as the subject. Idempotent — rows without the
 * prefix are left untouched.
 *
 *   node scripts/fix-newsletter-subjects.mjs
 */
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const SUPA_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' };

const res = await fetch(`${SUPA_URL}/rest/v1/email_templates?id=like.nl_d*&select=id,subject&order=id.asc`, { headers: H });
const rows = await res.json();
console.log(`Found ${rows.length} nl_d* templates.`);

const PREFIX = /^Day \d+ · /;
let updated = 0;
for (const row of rows) {
  if (!PREFIX.test(row.subject)) continue;
  const newSubject = row.subject.replace(PREFIX, '');
  const patchRes = await fetch(`${SUPA_URL}/rest/v1/email_templates?id=eq.${row.id}`, {
    method: 'PATCH',
    headers: H,
    body: JSON.stringify({ subject: newSubject }),
  });
  if (!patchRes.ok) {
    console.error(`  ✗ ${row.id}: ${patchRes.status} ${await patchRes.text()}`);
    continue;
  }
  console.log(`  ✓ ${row.id}: "${row.subject}" → "${newSubject}"`);
  updated++;
}
console.log(`\nDone. ${updated}/${rows.length} subjects updated.`);
