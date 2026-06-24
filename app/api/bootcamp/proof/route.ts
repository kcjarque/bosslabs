import { NextResponse } from 'next/server';
import {
  getBootcampReservation,
  markBootcampReservationProof,
  tierById,
} from '@/lib/bootcamp';
import { formatPHP } from '@/lib/config';
import { sendTelegramPhoto, esc } from '@/lib/telegram';
import { sendEmail } from '@/lib/email';
import { sendSms } from '@/lib/sms';
import { isSameOrigin } from '@/lib/admin-auth';

export const runtime = 'nodejs';

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    if (!isSameOrigin(req)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const form = await req.formData();
    const id = String(form.get('id') ?? '');
    const file = form.get('file');
    if (!id || !(file instanceof Blob)) {
      return NextResponse.json({ error: 'Missing reservation id or file.' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: 'Image too large — please upload a screenshot under 10MB.' },
        { status: 413 },
      );
    }
    if (file.type && !file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Please upload an image.' }, { status: 415 });
    }

    const r = await getBootcampReservation(id);
    if (!r) return NextResponse.json({ error: 'Reservation not found.' }, { status: 404 });

    const tierLabel = tierById(r.tier)?.label ?? r.tier;
    const bytes = await file.arrayBuffer();
    const filename = (file as File).name || 'bootcamp-proof.jpg';
    const caption = [
      `🎯 <b>Bootcamp DP proof</b> — ${esc(r.name)}${r.company ? ` (${esc(r.company)})` : ''}`,
      `${esc(tierLabel)} · ${r.seats} seat${r.seats === 1 ? '' : 's'} · DP ${formatPHP(r.amountDueCentavos)}`,
      `✉️ ${esc(r.email)}  📱 ${esc(r.phone)}`,
    ].join('\n');

    await sendTelegramPhoto(bytes, filename, caption);

    const firstSubmission = r.status === 'reserved';
    await markBootcampReservationProof(id);

    if (firstSubmission) {
      const firstName = r.name.split(/\s+/)[0] || r.name;
      const subject = `Got your proof — confirming your bootcamp seat`;
      const html = `
<p>Hi ${firstName},</p>
<p>Received your downpayment screenshot. The team is verifying it now — usually within a few hours during business hours.</p>
<p>You'll get a confirmation as soon as it clears.</p>
<p>— BossLabs AI</p>`;
      await sendEmail({ to: r.email, subject, html }).catch(() => null);
      if (r.phone) {
        await sendSms({
          to: r.phone,
          body: `Got your proof, ${firstName}! Verifying your AI Founder's Bootcamp downpayment — confirmation incoming.`,
        }).catch(() => null);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected error';
    console.error('[bootcamp/proof]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
