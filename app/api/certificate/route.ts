/**
 * /api/certificate — on-request Certificate of Participation.
 *
 * A webinar buyer enters the email they registered with. We verify it belongs
 * to a PAID (or attended) signup — no cert for anyone who didn't pay/attend —
 * then generate a signed Certificate of Participation dated to the webinar they
 * joined, upload it, and email the download link to that same address.
 *
 * Same-origin only. The cert is always emailed to the signup's own stored
 * address, so a stranger can't request someone else's cert to a new inbox.
 */
import { NextResponse } from 'next/server';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { getEvent } from '@/lib/db';
import { generateCertificatePdf, uploadCertificate } from '@/lib/certificate';
import { sendEmail } from '@/lib/email';
import { renderEmailMarkdown } from '@/lib/email-markdown';
import { isSameOrigin } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NOT_FOUND =
  "We couldn't find a paid webinar registration for that email. Certificates " +
  'are only for attendees who paid for the webinar — please use the exact email ' +
  'you registered with.';

function maskEmail(e: string): string {
  const [u, d] = e.split('@');
  if (!d) return e;
  const head = u.slice(0, Math.min(2, u.length));
  return `${head}${'•'.repeat(Math.max(1, u.length - 2))}@${d}`;
}

export async function POST(req: Request) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { email?: string };
  const email = (body.email ?? '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: 'Please enter a valid email.' });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: 'Service temporarily unavailable.' });
  }

  const sb = getSupabase();
  const { data } = await sb
    .from('signups')
    .select('id, first_name, last_name, email, status, event_id, created_at')
    .ilike('email', email)
    .in('status', ['paid', 'attended'])
    .order('created_at', { ascending: false });
  const rows = (data ?? []) as Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
    event_id: string | null;
    created_at: string;
  }>;
  if (rows.length === 0) {
    return NextResponse.json({ ok: false, error: NOT_FOUND });
  }

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', {
      timeZone: 'Asia/Manila',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

  // A Certificate of PARTICIPATION only makes sense for a webinar that has
  // already happened — you can't have participated in a future session. Resolve
  // each paid registration's webinar date and pick the most recent one that has
  // already started. (Someone who only pre-paid an upcoming session gets a
  // friendly "come back after" message instead of a future-dated cert.)
  const now = Date.now();
  let chosen: { row: (typeof rows)[number]; dateIso: string; webinarName: string } | null = null;
  let soonestFuture: string | null = null;
  for (const r of rows) {
    const ev = r.event_id ? await getEvent(r.event_id) : null;
    const dateIso = ev?.startsAtIso || r.created_at;
    const startMs = Date.parse(dateIso);
    if (!Number.isFinite(startMs)) continue;
    const webinarName = (ev?.name || '').replace(/\s*[—-].*$/, '').trim() || 'AI Vibe Coding 101';
    if (startMs <= now) {
      if (!chosen || Date.parse(chosen.dateIso) < startMs) chosen = { row: r, dateIso, webinarName };
    } else if (!soonestFuture) {
      soonestFuture = fmtDate(dateIso);
    }
  }
  if (!chosen) {
    return NextResponse.json({
      ok: false,
      error: soonestFuture
        ? `Your webinar is on ${soonestFuture} — your Certificate of Participation will be ready right after the session. See you there! 🎓`
        : NOT_FOUND,
    });
  }

  const s = chosen.row;
  const name = `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() || 'BossLabs Attendee';
  const firstName = (s.first_name ?? '').trim() || 'there';
  const dateLabel = fmtDate(chosen.dateIso);
  const webinarName = chosen.webinarName;

  const certId = 'BL-CERT-' + s.id.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase();
  const pdf = await generateCertificatePdf({ name, webinarName, dateLabel, certId });
  const url = await uploadCertificate(pdf, `${s.id}.pdf`);
  if (!url) {
    return NextResponse.json({ ok: false, error: 'Could not generate your certificate. Please try again.' });
  }

  const md = `^^Certificate Ready · BossLabs AI^^

# 🎓 Your certificate is ready, ${firstName}!

Congratulations on completing **${webinarName}** on **${dateLabel}**. Here is your official **Certificate of Participation**, signed by the founders.

[[ ⬇ Download your Certificate ]](${url})

Print it, frame it, or post it on LinkedIn — you earned it. Tag **BossLabs AI** and we may reshare it! 🙌

— Michael & Kyle, BossLabs AI`;

  const res = await sendEmail({
    to: s.email,
    subject: `🎓 Your ${webinarName} Certificate of Participation`,
    html: renderEmailMarkdown(md),
  });
  if (!res.ok) {
    return NextResponse.json({
      ok: false,
      error: 'Your certificate was generated but the email failed to send. Please try again in a moment.',
    });
  }

  return NextResponse.json({ ok: true, sentTo: maskEmail(s.email) });
}
