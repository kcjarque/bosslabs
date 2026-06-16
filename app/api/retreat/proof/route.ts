import { NextResponse } from 'next/server';
import {
  getRetreatReservation,
  markRetreatReservationProof,
} from '@/lib/db';
import { formatPHP } from '@/lib/config';
import { sendTelegramPhoto, esc } from '@/lib/telegram';
import { sendEmail } from '@/lib/email';
import { sendSms } from '@/lib/sms';

export const runtime = 'nodejs';

const MAX_BYTES = 10 * 1024 * 1024; // Telegram sendPhoto limit

export async function POST(req: Request) {
  try {
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
      return NextResponse.json(
        { error: 'Please upload an image (screenshot) of your payment.' },
        { status: 415 },
      );
    }

    const r = await getRetreatReservation(id);
    if (!r) {
      return NextResponse.json({ error: 'Reservation not found.' }, { status: 404 });
    }

    const bytes = await file.arrayBuffer();
    const filename = (file as File).name || 'payment-proof.jpg';
    const caption = [
      `💸 <b>Payment proof</b> — ${esc(r.name)}`,
      `${r.paymentMethod ? esc(r.paymentMethod) + ' · ' : ''}due ${formatPHP(r.amountDueCentavos ?? 0)}`,
      `✉️ ${esc(r.email)}  📱 ${esc(r.phone)}`,
    ].join('\n');

    await sendTelegramPhoto(bytes, filename, caption);
    await markRetreatReservationProof(id);

    // Payment confirmation to the customer — they've paid + uploaded proof.
    const firstName = r.name.split(/\s+/)[0] || r.name;
    const vars = {
      firstName,
      amount: `PHP ${((r.amountDueCentavos ?? 0) / 100).toLocaleString('en-PH')}`,
    };
    await sendEmail({ to: r.email, templateId: 'retreat_confirmation', vars }).catch(() => null);
    if (r.phone) await sendSms({ to: r.phone, templateId: 'retreat_confirmation', vars }).catch(() => null);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected error';
    console.error('[retreat/proof]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
