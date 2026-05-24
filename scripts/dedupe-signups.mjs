#!/usr/bin/env node
/**
 * One-shot signup deduplicator.
 *
 *   node scripts/dedupe-signups.mjs            # dry-run preview
 *   node scripts/dedupe-signups.mjs --apply    # actually delete
 *
 * Strategy per email:
 *   1. If any row is status='paid' or 'attended' → delete ALL other rows
 *      for that email. The paid/attended row is the source of truth; the
 *      others are dead "filled form again on retry" entries.
 *   2. Else if multiple status='registered' exist → keep the most recent,
 *      delete older. The most recent has the still-active Xendit invoice.
 *   3. Single-row emails are untouched.
 *
 * NEVER deletes paid/attended/refunded/unsubscribed — those have legal +
 * accounting significance. NEVER merges across different emails.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const DRY_RUN = !process.argv.includes('--apply');

function loadEnv() {
  const p = resolve(process.cwd(), '.env.local');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const m = t.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

async function fetchAll() {
  const r = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/signups?select=*&order=created_at.asc`,
    {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    },
  );
  if (!r.ok) throw new Error(`fetchAll: ${r.status} ${await r.text()}`);
  return r.json();
}

async function deleteById(id) {
  if (DRY_RUN) return { dryRun: true };
  const r = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/signups?id=eq.${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: 'return=representation',
      },
    },
  );
  if (!r.ok) throw new Error(`delete ${id}: ${r.status} ${await r.text()}`);
  return r.json();
}

async function main() {
  loadEnv();
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  console.log(DRY_RUN ? '── DRY RUN (no deletes will happen) ──\n' : '── APPLYING ──\n');

  const all = await fetchAll();
  console.log(`Total signups before: ${all.length}\n`);

  // Group by lowercase email
  const groups = new Map();
  for (const r of all) {
    const k = (r.email || '').toLowerCase().trim();
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }

  let toDelete = [];
  let kept = 0;

  for (const [email, rows] of groups.entries()) {
    if (rows.length === 1) {
      kept += 1;
      continue;
    }
    // Sort newest last (we did order=created_at.asc)
    rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
    const paid = rows.filter((r) => r.status === 'paid' || r.status === 'attended');
    const protectedRows = rows.filter((r) =>
      ['paid', 'attended', 'refunded', 'unsubscribed'].includes(r.status),
    );

    let keep;
    let drop;
    if (paid.length > 0) {
      // The paid/attended row(s) are source of truth — keep them, drop everything else.
      keep = paid[paid.length - 1]; // most recent paid
      drop = rows.filter((r) => r.id !== keep.id && !protectedRows.includes(r));
    } else {
      // All registered/etc — keep most recent, drop older registered.
      const registeredOnly = rows.filter((r) => r.status === 'registered');
      if (registeredOnly.length <= 1) {
        kept += 1;
        continue;
      }
      keep = registeredOnly[registeredOnly.length - 1];
      drop = registeredOnly.slice(0, -1);
    }

    console.log(`${email}: ${rows.length} rows`);
    console.log(`  KEEP   · ${keep.status.padEnd(11)} · ${keep.created_at.slice(0, 19)} · ${keep.id}`);
    for (const d of drop) {
      console.log(`  DELETE · ${d.status.padEnd(11)} · ${d.created_at.slice(0, 19)} · ${d.id}`);
      toDelete.push(d);
    }
    console.log();
    kept += 1;
  }

  console.log(`\n--- Summary ---`);
  console.log(`Distinct emails:           ${groups.size}`);
  console.log(`Rows to delete:            ${toDelete.length}`);
  console.log(`Rows that will remain:     ${all.length - toDelete.length}`);

  if (DRY_RUN) {
    console.log('\n(dry run — pass --apply to execute)');
    return;
  }

  console.log('\nApplying deletes...');
  for (const r of toDelete) {
    await deleteById(r.id);
    process.stdout.write('.');
  }
  console.log(`\n✓ deleted ${toDelete.length} duplicate rows`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
