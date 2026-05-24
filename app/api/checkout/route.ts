import { NextResponse } from 'next/server';
import { OFFER } from '@/lib/config';
import {
  createInvoice,
  PAYMENT_METHOD_GROUPS,
  resolvePaymentMethods,
  type PaymentMethodGroup,
} from '@/lib/xendit';
import { addSignup, findSignupByEmail, updateSignup } from '@/lib/db';
import { extractClientIp, extractFbCookies, sendCapiEvent } from '@/lib/meta';
import { siteUrl } from '@/lib/site';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      name?: string;
      email?: string;
      mobile?: string;
      bump?: boolean;
      paymentMethod?: PaymentMethodGroup;
      meta?: {
        eventId?: string;
        fbp?: string;
        fbc?: string;
        sourceUrl?: string;
      };
    };

    if (!body.email || !body.name) {
      return NextResponse.json({ error: 'Name and email required' }, { status: 400 });
    }

    // Validate paymentMethod group — accept only known keys, fall back to default mix.
    const group =
      body.paymentMethod && body.paymentMethod in PAYMENT_METHOD_GROUPS
        ? body.paymentMethod
        : undefined;
    const paymentMethods = resolvePaymentMethods(group);

    // BL- prefix → orderko's webhook router fans this into bosslabs.
    // Keep the prefix in sync with backend/routes/public.js in orderko.
    const externalId = `BL-MAIN-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
      paymentMethods,
    });

    // Persist the lead immediately (pending status). The Xendit webhook will
    // later flip status → 'paid' once the invoice clears.
    const [firstName, ...rest] = body.name.trim().split(' ');
    // Capture Meta matching data here so the webhook (which has none of
    // this) can fire a properly-matched Purchase CAPI event later.
    const headerFb = extractFbCookies(req);
    const fbp = body.meta?.fbp ?? headerFb.fbp;
    const fbc = body.meta?.fbc ?? headerFb.fbc;
    const clientIp = extractClientIp(req);
    const clientUserAgent = req.headers.get('user-agent') ?? undefined;
    const icEventId = body.meta?.eventId ?? `ic_${Date.now()}`;
    const purchaseEventId = `purchase_${externalId}`;

    // Dedupe: if this email already has a row, update it instead of
    // creating a new one. Stops the "filled the form 4 times during a
    // failed GCash QR loop" problem from polluting the signups table.
    //
    // Two cases:
    //  - Existing row is status='registered' → UPDATE it with the new
    //    invoice's externalId, fresh meta, new amount (if they ticked
    //    the bump this time). Same row, new payment attempt.
    //  - Existing row is status='paid'/'attended' → still insert a new
    //    row (rare edge case — buyer is paying a second time, e.g.
    //    OTO after-the-fact or re-buying). Future-proof for that.
    //  - No existing row → insert new (the original behavior).
    const existing = await findSignupByEmail(body.email);
    const sharedMetadata = {
      externalId,
      demo: invoice.demo,
      paymentMethodGroup: group ?? 'ALL',
      // Stash everything the Xendit webhook needs to fire a deduped CAPI
      // Purchase event when the invoice clears. Hashed at send-time.
      meta: {
        fbp,
        fbc,
        clientIp,
        clientUserAgent,
        purchaseEventId,
        sourceUrl: body.meta?.sourceUrl,
      },
    };

    if (existing && existing.status === 'registered') {
      // Same buyer retrying — point the existing row at the new Xendit
      // invoice. Preserve their CAPI event ID + match keys from any
      // earlier attempt so InitiateCheckout deduplicates cleanly.
      await updateSignup(existing.id, {
        firstName,
        lastName: rest.join(' ') || undefined,
        phone: body.mobile || existing.phone,
        amountCentavos,
        bumped,
        metadata: {
          ...(existing.metadata ?? {}),
          ...sharedMetadata,
          retryCount: ((existing.metadata as { retryCount?: number } | undefined)?.retryCount ?? 0) + 1,
          firstAttemptAt:
            (existing.metadata as { firstAttemptAt?: string } | undefined)?.firstAttemptAt ??
            existing.createdAt,
        },
      });
    } else {
      await addSignup({
        firstName,
        lastName: rest.join(' ') || undefined,
        email: body.email,
        phone: body.mobile || '',
        source: 'paid',
        status: 'registered',
        amountCentavos,
        bumped,
        metadata: sharedMetadata,
      });
    }

    // Fire InitiateCheckout CAPI — deduped with the pixel event via icEventId.
    // Best-effort; never blocks the redirect even on failure.
    void sendCapiEvent({
      eventName: 'InitiateCheckout',
      eventId: icEventId,
      eventSourceUrl: body.meta?.sourceUrl,
      userData: {
        email: body.email,
        phone: body.mobile,
        firstName,
        lastName: rest.join(' ') || undefined,
        fbp,
        fbc,
        clientIp,
        clientUserAgent,
        country: 'ph',
        externalId,
      },
      customData: {
        value: amountCentavos / 100,
        currency: 'PHP',
        contentName: OFFER.main.name,
        contentIds: [bumped ? `${OFFER.main.sku}+${OFFER.oto.sku}` : OFFER.main.sku],
        numItems: bumped ? 2 : 1,
      },
    });

    return NextResponse.json({ redirectUrl: invoice.invoiceUrl, demo: invoice.demo });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
