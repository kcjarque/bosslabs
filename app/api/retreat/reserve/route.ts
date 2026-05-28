import { NextResponse } from 'next/server';
import {
  createRetreatReservation,
  getFunnels,
  type RetreatMethod,
  type RetreatPlan,
} from '@/lib/db';
import { planAmountCentavos, planLabel } from '@/lib/retreat';
import { formatPHP } from '@/lib/config';
import { sendTelegram, esc } from '@/lib/telegram';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const b = (await req.json()) as Record<string, unknown>;
    const name = String(b.name ?? '').trim();
    const email = String(b.email ?? '').trim();
    const phone = String(b.phone ?? '').trim();
    if (!name || !email || !phone) {
      return NextResponse.json(
        { error: 'Name, email, and phone are required.' },
        { status: 400 },
      );
    }

    const paymentMethod = b.paymentMethod as RetreatMethod | undefined;
    const paymentPlan = b.paymentPlan as RetreatPlan | undefined;
    const overnight = typeof b.overnight === 'boolean' ? b.overnight : undefined;
    const diet = b.diet ? String(b.diet).trim() : '';
    const business = b.business ? String(b.business).trim() : '';
    const buildIdea = b.buildIdea ? String(b.buildIdea).trim() : '';
    const extraPersonName = b.extraPersonName ? String(b.extraPersonName).trim() : '';
    const tshirtSize = b.tshirtSize ? String(b.tshirtSize).trim() : '';
    const heardFrom = b.heardFrom ? String(b.heardFrom).trim() : '';

    const funnels = await getFunnels();
    const funnel = funnels.find((f) => f.slug === 'vibecode-retreat');
    const config = funnel?.config ?? {};
    const amountDueCentavos = planAmountCentavos(paymentPlan, config);

    const r = await createRetreatReservation({
      name,
      email,
      phone,
      paymentMethod,
      paymentPlan,
      overnight,
      diet,
      business,
      buildIdea,
      extraPersonName,
      tshirtSize,
      heardFrom,
      amountDueCentavos,
    });

    // Best-effort Telegram alert (awaited so it isn't killed when the
    // serverless function returns).
    const lines = [
      '🏕️ <b>New VibeCode Retreat reservation</b>',
      `👤 ${esc(name)}`,
      `✉️ ${esc(email)}`,
      `📱 ${esc(phone)}`,
      paymentPlan
        ? `💳 ${esc(planLabel(paymentPlan))} — due now ${formatPHP(amountDueCentavos)}`
        : '',
      paymentMethod ? `🏦 Via: ${esc(paymentMethod)}` : '',
      overnight !== undefined ? `🛏️ Overnight: ${overnight ? 'Yes' : 'No'}` : '',
      extraPersonName ? `➕ Plus one: ${esc(extraPersonName)}` : '',
      diet ? `🥗 Diet: ${esc(diet)}` : '',
      business ? `🏢 Business: ${esc(business)}` : '',
      buildIdea ? `🛠️ Wants to build: ${esc(buildIdea)}` : '',
      tshirtSize ? `👕 Shirt: ${esc(tshirtSize)}` : '',
      heardFrom ? `📣 Heard via: ${esc(heardFrom)}` : '',
    ].filter(Boolean);
    await sendTelegram(lines.join('\n'));

    return NextResponse.json({ id: r.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected error';
    console.error('[retreat/reserve]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
