/**
 * Comprehensive audit of TG notification coverage.
 *
 * Cross-references every signup against the four notification paths:
 *   1. 💰 Paid (main invoice) — fires from /api/webhooks/xendit handleMainPaid
 *   2. 💰 OTO upsell paid — fires from /api/webhooks/xendit handleOtoPaid
 *   3. 💰 Free promo purchase — fires from /api/checkout (free path)
 *   4. 🚨 Abandoned — fires from /api/cron/abandoned
 *
 * Reports anything paid/abandoned AFTER TG was configured that doesn't
 * have a confirmation marker we'd expect to see if the notification
 * succeeded. Read-only — does not send anything.
 *
 * Usage: npx tsx scripts/audit-tg-notifications.ts
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

import { getSignups } from '@/lib/db';

// TG settings went live around 03:55 UTC on May 27.
const TG_CONFIGURED_AT = new Date('2026-05-27T03:55:00Z').getTime();

async function main() {
  const all = await getSignups();

  // Buckets
  const paidAfterTg: typeof all = [];
  const otoAfterTg: typeof all = [];
  const freePromoAfterTg: typeof all = [];
  const abandonedAfterTg: typeof all = [];

  for (const s of all) {
    const meta = (s.metadata ?? {}) as {
      confirmationSent?: string;
      otoConfirmed?: string;
      promoCode?: string;
      abandonedNotified?: string;
    };

    // 1. Paid main invoice
    if (
      s.status === 'paid' &&
      meta.confirmationSent &&
      new Date(meta.confirmationSent).getTime() >= TG_CONFIGURED_AT
    ) {
      paidAfterTg.push(s);
    }

    // 2. OTO upsell paid (bumped via standalone OTO invoice, not bumped at checkout)
    if (
      meta.otoConfirmed &&
      new Date(meta.otoConfirmed).getTime() >= TG_CONFIGURED_AT
    ) {
      otoAfterTg.push(s);
    }

    // 3. Free promo purchase
    if (
      s.status === 'paid' &&
      s.amountCentavos === 0 &&
      meta.promoCode &&
      new Date(s.createdAt).getTime() >= TG_CONFIGURED_AT
    ) {
      freePromoAfterTg.push(s);
    }

    // 4. Abandoned + notified
    if (
      meta.abandonedNotified &&
      new Date(meta.abandonedNotified).getTime() >= TG_CONFIGURED_AT
    ) {
      abandonedAfterTg.push(s);
    }
  }

  console.log('=== TG Coverage Audit ===');
  console.log(`TG configured at: ${new Date(TG_CONFIGURED_AT).toISOString()}`);
  console.log(`Total signups: ${all.length}\n`);

  console.log(`📊 Counts since TG was configured:`);
  console.log(`  💰 Paid (main invoice):  ${paidAfterTg.length}`);
  console.log(`  💰 OTO upsells paid:     ${otoAfterTg.length}`);
  console.log(`  💰 Free promo purchases: ${freePromoAfterTg.length}`);
  console.log(`  🚨 Abandoned notified:   ${abandonedAfterTg.length}\n`);

  if (paidAfterTg.length > 0) {
    console.log(`Paid main invoices since TG live:`);
    for (const s of paidAfterTg) {
      const meta = (s.metadata ?? {}) as { confirmationSent?: string };
      console.log(
        `  ${meta.confirmationSent} → ${s.firstName} ${s.lastName ?? ''} | ${s.email} | ₱${(s.amountCentavos ?? 0) / 100}${s.bumped ? ' +OTO' : ''}`,
      );
    }
    console.log('');
  }

  if (otoAfterTg.length > 0) {
    console.log(`Standalone OTO invoices since TG live:`);
    for (const s of otoAfterTg) {
      const meta = (s.metadata ?? {}) as { otoConfirmed?: string; otoAmount?: number };
      console.log(
        `  ${meta.otoConfirmed} → ${s.firstName} ${s.lastName ?? ''} | ${s.email} | ₱${meta.otoAmount}`,
      );
    }
    console.log('');
  }

  if (freePromoAfterTg.length > 0) {
    console.log(`Free promo purchases since TG live:`);
    for (const s of freePromoAfterTg) {
      const meta = (s.metadata ?? {}) as { promoCode?: string };
      console.log(
        `  ${s.createdAt} → ${s.firstName} ${s.lastName ?? ''} | ${s.email} | promo=${meta.promoCode}`,
      );
    }
    console.log('');
  }

  // Flag mismatches: status=paid but no confirmationSent? OTO bump without otoConfirmed?
  console.log(`=== Suspicious states ===`);
  let suspicious = 0;
  for (const s of all) {
    const meta = (s.metadata ?? {}) as {
      confirmationSent?: string;
      otoConfirmed?: string;
      otoInvoiceId?: string;
    };
    // Paid signups without confirmationSent at all (webhook never fired?)
    if (s.status === 'paid' && !meta.confirmationSent && s.amountCentavos && s.amountCentavos > 0) {
      console.log(
        `  ⚠️  PAID without confirmationSent: ${s.firstName} ${s.lastName ?? ''} (${s.email})`,
      );
      suspicious++;
    }
    // Signups bumped via OTO invoice (otoInvoiceId set) but no otoConfirmed marker?
    if (meta.otoInvoiceId && !meta.otoConfirmed) {
      console.log(
        `  ⚠️  OTO invoice ID set without otoConfirmed: ${s.firstName} ${s.lastName ?? ''}`,
      );
      suspicious++;
    }
  }
  if (suspicious === 0) {
    console.log('  None.');
  }
}

main().catch(console.error);
