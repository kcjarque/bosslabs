import { NextResponse } from 'next/server';
import { OFFER } from '@/lib/config';
import { createInvoice } from '@/lib/xendit';
import { addSignup } from '@/lib/db';

export const runtime = 'nodejs';

function siteUrl(req: Request) {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      name?: string;
      email?: string;
      mobile?: string;
      bump?: boolean;
    };

    if (!body.email || !body.name) {
      return NextResponse.json({ error: 'Name and email required' }, { status: 400 });
    }

    const externalId = `bl_main_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const base = siteUrl(req);
    const bumped = Boolean(body.bump);

    const amountCentavos =
      OFFER.main.priceCentavos + (bumped ? OFFER.oto.priceCentavos : 0);
    const description = bumped
      ? `${OFFER.main.name} + ${OFFER.oto.name}`
      : OFFER.main.name;

    const invoice = await createInvoice({
      externalId,
      amount: amountCentavos / 100,
      description,
      payerEmail: body.email,
      successRedirectUrl: `${base}/oto?order=${externalId}${bumped ? '&bumped=1' : ''}`,
      failureRedirectUrl: `${base}/checkout?status=failed`,
      customer: {
        givenNames: body.name,
        email: body.email,
        mobileNumber: body.mobile,
      },
    });

    // Persist the lead immediately (pending status). The Xendit webhook will
    // later flip status → 'paid' once the invoice clears.
    const [firstName, ...rest] = body.name.trim().split(' ');
    await addSignup({
      firstName,
      lastName: rest.join(' ') || undefined,
      email: body.email,
      phone: body.mobile || '',
      source: 'paid',
      status: 'registered',
      amountCentavos,
      bumped,
      metadata: { externalId, demo: invoice.demo },
    });

    return NextResponse.json({ redirectUrl: invoice.invoiceUrl, demo: invoice.demo });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
