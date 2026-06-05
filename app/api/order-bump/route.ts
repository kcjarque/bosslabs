/**
 * /api/order-bump — standalone order-bump (₱1,997 1:1 AI Integration Audit)
 * checkout for webinar attendees who already bought the ₱999 ticket and want
 * to add the upgrade afterwards.
 *
 * Identify-by-email: look up the buyer's PAID ticket, then create a
 * BL-OTO-<mainOrder> invoice scoped to their chosen payment method. The
 * existing Xendit OTO webhook (handleOtoPaid) then attaches the bump to their
 * record — so it shows "with bump" and counts as an OTO, exactly like the
 * post-checkout flow. No webhook changes needed.
 */

import { NextResponse } from 'next/server';
import { OFFER } from '@/lib/config';
import { createInvoice, resolvePaymentMethods, type PaymentMethodGroup } from '@/lib/xendit';
import { findSignupByEmail } from '@/lib/db';
import { resolveOtoOffer } from '@/lib/webinar';
import { siteUrl } from '@/lib/site';

export const runtime = 'nodejs';

const PAID = new Set(['paid', 'attended']);
const GROUPS = ['GCASH', 'CREDIT_CARD', 'BANKS'];

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      email?: string;
      paymentMethod?: string;
    };
    const email = (body.email || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Please enter a valid email.' }, { status: 400 });
    }

    const parent = await findSignupByEmail(email);
    const mainOrder = (parent?.metadata as { externalId?: string } | undefined)?.externalId;

    // Must have a PAID ₱999 ticket on file to add the bump.
    if (!parent || !PAID.has(parent.status) || !mainOrder?.startsWith('BL-MAIN-')) {
      return NextResponse.json(
        {
          error:
            "We couldn't find a paid ticket for that email. Please use the same email you registered with for the webinar.",
        },
        { status: 404 },
      );
    }

    // Already have the bump? Don't let them pay twice.
    if ((parent.metadata as { otoConfirmed?: string } | undefined)?.otoConfirmed) {
      return NextResponse.json(
        { error: 'Your order bump is already active on this ticket — no need to pay again.' },
        { status: 409 },
      );
    }

    const group = GROUPS.includes(body.paymentMethod ?? '')
      ? (body.paymentMethod as PaymentMethodGroup)
      : undefined;
    const externalId = `BL-OTO-${mainOrder}-${Date.now()}`;
    const base = siteUrl(req);

    // ₱1,997 before/during the webinar, ₱3,997 after — server-authoritative.
    const oto = await resolveOtoOffer();

    const invoice = await createInvoice({
      externalId,
      amount: oto.centavos / 100,
      description: OFFER.oto.name,
      payerEmail: parent.email,
      successRedirectUrl: `${base}/thank-you?order=${mainOrder}&oto=1`,
      failureRedirectUrl: `${base}/order-bump?status=failed`,
      customer: {
        givenNames: parent.firstName,
        email: parent.email,
        mobileNumber: parent.phone || undefined,
      },
      paymentMethods: resolvePaymentMethods(group),
    });

    return NextResponse.json({ redirectUrl: invoice.invoiceUrl, demo: invoice.demo });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
