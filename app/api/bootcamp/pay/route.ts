/**
 * AI Founder's Bootcamp — credit card downpayment via a dynamic Xendit invoice.
 *
 * externalId = BL-BOOTCAMP-<reservationId>-<ts>. The Xendit webhook (same prefix)
 * auto-confirms the reservation when it clears.
 */
import { NextResponse } from 'next/server';
import { createInvoice } from '@/lib/xendit';
import { getBootcampReservation, tierById } from '@/lib/bootcamp';
import { siteUrl } from '@/lib/site';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { id?: string; payIn?: 'dp' | 'full' };
    const id = body.id;
    const payIn: 'dp' | 'full' = body.payIn === 'full' ? 'full' : 'dp';
    if (!id) return NextResponse.json({ error: 'Missing reservation id.' }, { status: 400 });

    const r = await getBootcampReservation(id);
    if (!r) return NextResponse.json({ error: 'Reservation not found.' }, { status: 404 });

    const base = siteUrl(req);
    const doneUrl = `${base}/founders-bootcamp/reserve/${id}/done?paid=card`;

    if (r.status === 'paid' && r.balanceDueCentavos === 0) {
      return NextResponse.json({ redirectUrl: doneUrl, alreadyPaid: true });
    }

    // Charge the right amount given what's already been settled:
    //  - reservation untouched → DP or full (whichever the buyer picked).
    //  - DP already cleared (status='paid' + balance>0) → 'full' means "settle
    //    the remaining balance" (NOT the full price again), 'dp' is refused.
    const dpAlreadyPaid = r.status === 'paid' && r.balanceDueCentavos > 0;
    let amountCentavos: number;
    let label: string;
    if (dpAlreadyPaid) {
      if (payIn === 'dp') {
        return NextResponse.json(
          { error: 'Downpayment already cleared. Switch to "Pay in full" to settle the balance.' },
          { status: 409 },
        );
      }
      amountCentavos = r.balanceDueCentavos;
      label = 'balance';
    } else {
      amountCentavos = payIn === 'full' ? r.totalCentavos : r.amountDueCentavos;
      label = payIn === 'full' ? 'full payment' : 'downpayment';
    }
    if (!amountCentavos || amountCentavos < 100) {
      return NextResponse.json({ error: 'Invalid amount for this reservation.' }, { status: 400 });
    }

    const tierLabel = tierById(r.tier)?.label ?? r.tier;
    const invoice = await createInvoice({
      externalId: `BL-BOOTCAMP-${id}-${Date.now()}`,
      amount: amountCentavos / 100,
      description: `AI Founder's Bootcamp — ${tierLabel} ${label} (${r.name})`,
      payerEmail: r.email,
      successRedirectUrl: doneUrl,
      failureRedirectUrl: `${base}/founders-bootcamp/reserve/${id}?status=failed`,
      customer: { givenNames: r.name, email: r.email, mobileNumber: r.phone },
      paymentMethods: ['CREDIT_CARD'],
    });

    return NextResponse.json({ redirectUrl: invoice.invoiceUrl, demo: invoice.demo });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected error';
    console.error('[bootcamp/pay]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
