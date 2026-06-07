/**
 * OneWaySMS Delivery Report (DLR) webhook.
 *
 * OneWaySMS pushes a delivery receipt to this URL once it knows the outcome of
 * an SMS. The send API returns a numeric message-id (mtID); the DLR references
 * the same id, so we match it back to the paid-confirmation SMS we stored on
 * the signup (metadata.confirmationSmsId) and stamp delivered / failed.
 *
 * OneWaySMS's exact param names/status values aren't well documented, so this
 * handler is deliberately flexible (accepts GET or POST; tries common param
 * names) and logs the raw (redacted) payload so we can confirm the real format
 * from the first live DLR and tighten the mapping if needed.
 *
 * Setup: give OneWaySMS this push URL (dashboard / support):
 *   https://www.bosslabs.live/api/webhooks/sms-dlr
 * Optionally set SMS_DLR_SECRET and append ?key=<secret> to that URL.
 */

import { NextResponse } from 'next/server';
import { findSignupByConfirmationSmsId, updateConfirmationSmsStatus } from '@/lib/db';

export const runtime = 'nodejs';

const DLR_SECRET = process.env.SMS_DLR_SECRET || '';

/** Case-insensitive lookup across a set of likely param names. */
function pick(params: Record<string, string>, names: string[]): string | undefined {
  const want = new Set(names.map((n) => n.toLowerCase()));
  for (const [k, v] of Object.entries(params)) {
    if (want.has(k.toLowerCase())) return v;
  }
  return undefined;
}

/** Map a provider status string to our pill states. Unknown → null (logged). */
function mapStatus(raw: string | undefined): 'delivered' | 'bounced' | 'sent' | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (/undeliv|fail|expir|reject|error|delet|blocked|rejectd/.test(s)) return 'bounced';
  if (/deliv|delivrd|success|^ok$/.test(s)) return 'delivered';
  if (/sent|submit|accept|pending|queue|enroute/.test(s)) return 'sent';
  return null;
}

/** Log keys + values but never the recipient number. */
function redactedLog(params: Record<string, string>) {
  const safe: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    safe[k] = /mobile|msisdn|number|phone|recipient|dest/i.test(k) ? '[redacted]' : v;
  }
  console.log('[sms-dlr]', JSON.stringify(safe));
}

async function handle(params: Record<string, string>) {
  redactedLog(params);
  const id = pick(params, ['mtID', 'mtid', 'mt_id', 'messageid', 'message_id', 'msgid', 'smsid', 'id']);
  const status = mapStatus(
    pick(params, ['status', 'dlrstatus', 'deliverystatus', 'delivery_status', 'stat', 'statuscode']),
  );
  if (!id || !status) return { matched: false as const, ignored: true };
  const sg = await findSignupByConfirmationSmsId(id);
  if (sg) {
    await updateConfirmationSmsStatus(sg.id, status, new Date().toISOString());
    return { matched: 'confirmation' as const, status };
  }
  return { matched: false as const, status };
}

function authed(url: URL): boolean {
  return !DLR_SECRET || url.searchParams.get('key') === DLR_SECRET;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!authed(url)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const params = Object.fromEntries(url.searchParams.entries());
  return NextResponse.json({ ok: true, ...(await handle(params)) });
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  if (!authed(url)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  let params: Record<string, string> = Object.fromEntries(url.searchParams.entries());
  const ct = req.headers.get('content-type') || '';
  try {
    if (ct.includes('application/json')) {
      const j = (await req.json()) as Record<string, string>;
      params = { ...params, ...j };
    } else {
      const txt = await req.text();
      if (txt) params = { ...params, ...Object.fromEntries(new URLSearchParams(txt).entries()) };
    }
  } catch {
    /* keep query params */
  }
  return NextResponse.json({ ok: true, ...(await handle(params)) });
}
