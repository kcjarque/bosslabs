import { NextResponse } from 'next/server';
import { OFFER } from '@/lib/config';
import { createInvoice } from '@/lib/xendit';

export const runtime = 'nodejs';

function siteUrl(req: Request) {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { orderId?: string };
    const mainOrder = body.orderId || `BL-MAIN-unknown-${Date.now()}`;
    // BL- prefix → orderko fans this into bosslabs (same convention as /checkout).
    const externalId = `BL-OTO-${mainOrder}-${Date.now()}`;
    const base = siteUrl(req);

    // In production: look up the original order in Supabase to pre-fill
    // payer email + customer info on the OTO invoice. For now we pass minimal info.
    const invoice = await createInvoice({
      externalId,
      amount: OFFER.oto.priceCentavos / 100,
      description: OFFER.oto.name,
      successRedirectUrl: `${base}/thank-you?order=${mainOrder}&oto=1`,
      failureRedirectUrl: `${base}/thank-you?order=${mainOrder}&oto=failed`,
    });

    return NextResponse.json({ redirectUrl: invoice.invoiceUrl, demo: invoice.demo });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
