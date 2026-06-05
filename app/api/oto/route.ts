/**
 * /api/oto — creates the standalone OTO invoice (the 1:1 AI Integration
 * Audit upsell) for a buyer who didn't bump at checkout.
 *
 * Looks up the parent signup so we can pre-fill payer email + customer
 * info on the Xendit hosted page. Without this, the buyer would have to
 * retype their email — and PH bank/Maya channels often fail without it.
 */

import { NextResponse } from 'next/server';
import { OFFER } from '@/lib/config';
import { createInvoice } from '@/lib/xendit';
import { findSignupByExternalId } from '@/lib/db';
import { siteUrl } from '@/lib/site';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { orderId?: string };
    const mainOrder = (body.orderId || '').trim();

    // Hard-validate the parent order ID — without a real BL-MAIN-* parent,
    // the OTO can't be attributed back to a buyer.
    if (!mainOrder.startsWith('BL-MAIN-')) {
      return NextResponse.json({ error: 'orderId missing or invalid' }, { status: 400 });
    }

    const parent = await findSignupByExternalId(mainOrder);
    if (!parent) {
      return NextResponse.json({ error: 'parent order not found' }, { status: 404 });
    }

    const externalId = `BL-OTO-${mainOrder}-${Date.now()}`;
    const base = siteUrl(req);

    const invoice = await createInvoice({
      externalId,
      amount: OFFER.oto.priceCentavos / 100,
      description: OFFER.oto.name,
      payerEmail: parent.email,
      successRedirectUrl: `${base}/thank-you?order=${mainOrder}&oto=1`,
      failureRedirectUrl: `${base}/thank-you?order=${mainOrder}&oto=failed`,
      customer: {
        givenNames: parent.firstName,
        email: parent.email,
        mobileNumber: parent.phone || undefined,
      },
    });

    return NextResponse.json({ redirectUrl: invoice.invoiceUrl, demo: invoice.demo });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
