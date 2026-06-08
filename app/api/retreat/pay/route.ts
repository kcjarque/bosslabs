/**
 * VibeCode Retreat — card payment via a DYNAMIC Xendit invoice.
 *
 * The reservation already knows the amount due now (the plan's deposit /
 * installment / full price). This creates a Xendit invoice for exactly that
 * amount and returns its hosted URL. The Xendit webhook (BL-RETREAT- prefix)
 * auto-confirms the reservation when it clears.
 *
 * externalId = BL-RETREAT-<reservationId>-<ts>. The reservationId is a UUID;
 * the trailing -<ts> keeps each invoice unique (Xendit requires a unique
 * external_id), and the webhook recovers the UUID with a regex.
 */
import { NextResponse } from 'next/server';
import {
  getRetreatReservation,
  getFunnels,
  type EventFunnelConfig,
} from '@/lib/db';
import { createInvoice } from '@/lib/xendit';
import { planAmountCentavos, planLabel } from '@/lib/retreat';
import { siteUrl } from '@/lib/site';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const { id } = (await req.json().catch(() => ({}))) as { id?: string };
    if (!id) {
      return NextResponse.json({ error: 'Missing reservation id.' }, { status: 400 });
    }

    const r = await getRetreatReservation(id);
    if (!r) {
      return NextResponse.json({ error: 'Reservation not found.' }, { status: 404 });
    }

    const base = siteUrl(req);
    const doneUrl = `${base}/vibecode-retreat/reserve/${id}/done?paid=card`;

    // Already settled — skip Xendit, send them straight to the confirmation.
    if (r.status === 'paid') {
      return NextResponse.json({ redirectUrl: doneUrl, alreadyPaid: true });
    }

    // Amount due now: prefer the stored figure, else recompute from the plan.
    const funnels = await getFunnels();
    const config = (funnels.find((f) => f.slug === 'vibecode-retreat')?.config ??
      {}) as EventFunnelConfig;
    const amountCentavos = r.amountDueCentavos ?? planAmountCentavos(r.paymentPlan, config);
    if (!amountCentavos || amountCentavos < 100) {
      return NextResponse.json({ error: 'Invalid amount for this reservation.' }, { status: 400 });
    }

    const invoice = await createInvoice({
      externalId: `BL-RETREAT-${id}-${Date.now()}`,
      amount: amountCentavos / 100,
      description: `VibeCode Retreat — ${planLabel(r.paymentPlan)} (${r.name})`,
      payerEmail: r.email,
      successRedirectUrl: doneUrl,
      failureRedirectUrl: `${base}/vibecode-retreat/reserve/${id}?status=failed`,
      customer: { givenNames: r.name, email: r.email, mobileNumber: r.phone },
      paymentMethods: ['CREDIT_CARD'],
    });

    return NextResponse.json({ redirectUrl: invoice.invoiceUrl, demo: invoice.demo });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected error';
    console.error('[retreat/pay]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
