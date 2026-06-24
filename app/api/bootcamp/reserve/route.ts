/**
 * AI Founder's Bootcamp — create reservation (downpayment slot).
 *
 * Validates the chosen tier + (if promo) the discount code, locks the price,
 * and creates a reservation row. The DB trigger refuses the insert if it
 * would push us past 80 total seats (hard cap).
 */
import { NextResponse } from 'next/server';
import {
  BOOTCAMP_DOWNPAYMENT_PER_SEAT_CENTAVOS,
  BOOTCAMP_TIERS,
  bootcampSeatsRemaining,
  createBootcampReservation,
  tierById,
  type BootcampGroupMember,
  type BootcampMethod,
  type BootcampTier,
} from '@/lib/bootcamp';
import { sendTelegram, esc } from '@/lib/telegram';
import { sendEmail } from '@/lib/email';
import { sendSms } from '@/lib/sms';
import { isSameOrigin } from '@/lib/admin-auth';

export const runtime = 'nodejs';

function phpPlain(centavos: number): string {
  return `PHP ${(centavos / 100).toLocaleString('en-PH')}`;
}

export async function POST(req: Request) {
  try {
    if (!isSameOrigin(req)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const b = (await req.json()) as Record<string, unknown>;
    const name = String(b.name ?? '').trim();
    const email = String(b.email ?? '').trim();
    const phone = String(b.phone ?? '').trim();
    const company = String(b.company ?? '').trim();
    const tier = String(b.tier ?? '').trim() as BootcampTier;
    const discountCodeInput = String(b.discountCode ?? '').trim();
    const buildIdea = String(b.buildIdea ?? '').trim();
    const heardFrom = String(b.heardFrom ?? '').trim();
    const paymentMethod = b.paymentMethod as BootcampMethod | undefined;
    const rawMembers = Array.isArray(b.groupMembers) ? b.groupMembers : [];
    const groupMembers: BootcampGroupMember[] = rawMembers
      .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
      .map((m) => ({
        name: String(m.name ?? '').trim(),
        email: String(m.email ?? '').trim(),
        phone: String(m.phone ?? '').trim(),
      }))
      .filter((m) => m.name);

    if (!name || !email || !phone) {
      return NextResponse.json(
        { error: 'Name, email, and phone are required.' },
        { status: 400 },
      );
    }

    const tierDef = tierById(tier);
    if (!tierDef) return NextResponse.json({ error: 'Pick a ticket tier.' }, { status: 400 });
    const perSeatCentavos = tierDef.perSeatCentavos;
    // discountCodeInput is captured for back-compat audit; no tier currently uses it.
    const storedDiscountCode = discountCodeInput;

    // Group tier: ensure at least (seats - 1) other members provided so the
    // roster is complete enough to onboard. We don't strictly validate emails
    // here — admin will follow up to collect missing details.
    const minOthers = Math.max(0, tierDef.seats - 1);
    const trimmedMembers = groupMembers.slice(0, tierDef.seats - 1);
    if (tierDef.seats > 1 && trimmedMembers.length < minOthers) {
      return NextResponse.json(
        {
          error: `Group tier needs ${minOthers} additional name${minOthers === 1 ? '' : 's'}.`,
        },
        { status: 400 },
      );
    }

    // Cap pre-check (the trigger is final, but this gives a friendlier error).
    const remaining = await bootcampSeatsRemaining();
    if (remaining < tierDef.seats) {
      return NextResponse.json(
        {
          error:
            remaining === 0
              ? 'The bootcamp is fully booked. Reservations closed.'
              : `Only ${remaining} seat${remaining === 1 ? '' : 's'} left — too few for this tier.`,
        },
        { status: 409 },
      );
    }

    const seats = tierDef.seats;
    const totalCentavos = perSeatCentavos * seats;
    const amountDueCentavos = BOOTCAMP_DOWNPAYMENT_PER_SEAT_CENTAVOS * seats;
    const balanceDueCentavos = Math.max(0, totalCentavos - amountDueCentavos);

    let r;
    try {
      r = await createBootcampReservation({
        name,
        email,
        phone,
        company,
        tier,
        seats,
        perSeatCentavos,
        totalCentavos,
        amountDueCentavos,
        balanceDueCentavos,
        groupMembers: trimmedMembers,
        buildIdea,
        heardFrom,
        discountCode: storedDiscountCode,
        paymentMethod,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unexpected error';
      if (/BOOTCAMP_FULL/.test(msg)) {
        return NextResponse.json(
          {
            error: 'Bootcamp seats just sold out. Refresh to see real-time count.',
          },
          { status: 409 },
        );
      }
      throw err;
    }

    // Best-effort Telegram alert (awaited so it isn't killed when the
    // serverless function returns).
    const tierLabel = BOOTCAMP_TIERS.find((t) => t.id === tier)?.label ?? tier;
    const lines = [
      `🎯 <b>AI Founder's Bootcamp — new reservation</b>`,
      `👤 ${esc(name)}${company ? ` (${esc(company)})` : ''}`,
      `✉️ ${esc(email)}`,
      `📱 ${esc(phone)}`,
      `🎟️ ${esc(tierLabel)} — ${seats} seat${seats === 1 ? '' : 's'} @ ${phpPlain(perSeatCentavos)}`,
      `💰 Total: ${phpPlain(totalCentavos)} — DP due: ${phpPlain(amountDueCentavos)}`,
      storedDiscountCode ? `🎁 Code: <code>${esc(storedDiscountCode)}</code>` : '',
      trimmedMembers.length
        ? `👥 Group: ${trimmedMembers.map((m) => esc(m.name)).join(', ')}`
        : '',
      buildIdea ? `🛠️ Wants to build: ${esc(buildIdea)}` : '',
      heardFrom ? `📣 Heard via: ${esc(heardFrom)}` : '',
    ].filter(Boolean);
    await sendTelegram(lines.join('\n'));

    // Reservation-received confirmation to the customer.
    const firstName = name.split(/\s+/)[0] || name;
    const seatLabel = `${seats} seat${seats === 1 ? '' : 's'}`;
    const subject = `Your AI Founder's Bootcamp seat — downpayment locks it`;
    const html = `
<p>Hi ${firstName},</p>
<p>Salamat! Reserved mo na <strong>${seatLabel}</strong> sa AI Founder's Bootcamp.</p>
<p>To lock it in, send your downpayment of <strong>${phpPlain(amountDueCentavos)}</strong>.
You can pay by credit card or bank transfer from your reservation page:</p>
<p><a href="https://bosslabs.live/founders-bootcamp/reserve/${r.id}" style="display:inline-block;padding:12px 20px;background:#00B8E6;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Complete reservation</a></p>
<p>Once we see the downpayment we'll send your seat confirmation + bootcamp details.</p>
<p style="color:#b45309;font-size:13px"><strong>Heads up:</strong> the downpayment is non-refundable — only pay once you're committed to showing up.</p>
<p>— BossLabs AI</p>`;
    await sendEmail({ to: email, subject, html }).catch(() => null);
    if (phone) {
      await sendSms({
        to: phone,
        body: `Hi ${firstName}! Reserved your AI Founder's Bootcamp ${seatLabel}. DP due: ${phpPlain(amountDueCentavos)}. Pay: bosslabs.live/founders-bootcamp/reserve/${r.id}`,
      }).catch(() => null);
    }

    return NextResponse.json({ id: r.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected error';
    console.error('[bootcamp/reserve]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
