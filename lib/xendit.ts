/**
 * Thin wrapper over Xendit's Invoice API.
 *
 * Demo mode: if XENDIT_SECRET_KEY is unset, returns a stub redirect URL
 * pointing to the next funnel step so the funnel is fully click-throughable
 * during dev/preview without real credentials.
 */

/**
 * Xendit Invoice API `payment_methods` whitelist. When passed, the hosted
 * invoice page only shows these channels — anything else is hidden.
 * Values come from https://docs.xendit.co/invoice — keep this narrow on
 * purpose so the checkout matches the badges shown on our own page.
 */
export type XenditPaymentMethod =
  | 'CREDIT_CARD'
  | 'GCASH'
  | 'PAYMAYA'
  | 'GRABPAY'
  | 'SHOPEEPAY'
  | 'BPI'
  | 'BDO'
  | 'UNIONBANK';

export const DEFAULT_PAYMENT_METHODS: XenditPaymentMethod[] = [
  'CREDIT_CARD',
  'GCASH',
  'PAYMAYA',
];

type CreateInvoiceArgs = {
  externalId: string;
  amount: number; // in major units (PHP, not centavos)
  description: string;
  payerEmail?: string;
  successRedirectUrl: string;
  failureRedirectUrl: string;
  customer?: { givenNames?: string; email?: string; mobileNumber?: string };
  paymentMethods?: XenditPaymentMethod[];
};

type InvoiceResult = {
  id: string;
  invoiceUrl: string;
  demo: boolean;
};

export function isDemoMode() {
  return !process.env.XENDIT_SECRET_KEY;
}

export async function createInvoice(args: CreateInvoiceArgs): Promise<InvoiceResult> {
  if (isDemoMode()) {
    // Skip the real API call. Pretend the user paid and route to the success URL.
    return {
      id: `demo_${args.externalId}`,
      invoiceUrl: args.successRedirectUrl,
      demo: true,
    };
  }

  const auth = Buffer.from(`${process.env.XENDIT_SECRET_KEY}:`).toString('base64');

  const res = await fetch('https://api.xendit.co/v2/invoices', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      external_id: args.externalId,
      amount: args.amount,
      description: args.description,
      payer_email: args.payerEmail,
      success_redirect_url: args.successRedirectUrl,
      failure_redirect_url: args.failureRedirectUrl,
      currency: 'PHP',
      // Restrict hosted invoice page to the methods we advertise on-site.
      payment_methods: args.paymentMethods ?? DEFAULT_PAYMENT_METHODS,
      customer: args.customer
        ? {
            given_names: args.customer.givenNames,
            email: args.customer.email,
            mobile_number: args.customer.mobileNumber,
          }
        : undefined,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Xendit invoice failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { id: string; invoice_url: string };
  return { id: data.id, invoiceUrl: data.invoice_url, demo: false };
}

export function verifyWebhook(headerToken: string | null) {
  // Xendit signs callbacks with a static token configured in the dashboard.
  const expected = process.env.XENDIT_WEBHOOK_TOKEN;
  if (!expected) return false;
  return headerToken === expected;
}
