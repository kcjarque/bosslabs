/**
 * Safety-net cron: auto-provision Hub accounts for Vault buyers the payment
 * webhook missed.
 *
 * Runs every 10 min. Finds high-confidence Vault buyers (deduped by email)
 * with no Hub account, provisions each + emails their credentials. Self-empties
 * once everyone's covered (idempotent — a provisioned buyer is skipped next run),
 * so it no-ops on a clean sweep. Telegram summary only when it actually acts.
 *
 * Runs server-side where HUB_PROVISION_TOKEN + email creds exist — no human
 * click and no operator token needed.
 */
import { NextResponse } from 'next/server';
import { getSignups } from '@/lib/db';
import { findStuckVaultBuyers, provisionAndEmailBuyer } from '@/lib/hub-backfill';
import { siteUrl } from '@/lib/site';
import { sendTelegram, esc } from '@/lib/telegram';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const signups = await getSignups();
  const stuck = findStuckVaultBuyers(signups);
  if (stuck.length === 0) {
    return NextResponse.json({ ok: true, stuck: 0 });
  }

  const base = siteUrl(req);
  const results = [];
  for (const b of stuck) {
    const r = await provisionAndEmailBuyer(b, { baseUrl: base, allSignups: signups });
    results.push(r);
  }

  const emailed = results.filter((r) => r.emailSent);
  const failed = results.filter((r) => !r.emailSent);
  await sendTelegram(
    `🛟 <b>Hub backfill (auto)</b>\nProvisioned + emailed <b>${emailed.length}</b> Vault buyer(s) who were missing Hub access` +
      (emailed.length ? `:\n${emailed.map((r) => `• ${esc(r.email)}`).join('\n')}` : '') +
      (failed.length ? `\n⚠️ ${failed.length} failed — check logs.` : ''),
  ).catch(() => {});

  return NextResponse.json({ ok: true, stuck: stuck.length, emailed: emailed.length, detail: results });
}
