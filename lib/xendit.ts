/**
 * Thin wrapper over Xendit's Invoice API.
 *
 * Demo mode: if XENDIT_SECRET_KEY is unset, returns a stub redirect URL
 * pointing to the next funnel step so the funnel is fully click-throughable
 * during dev/preview without real credentials.
 */

import { timingSafeEqual } from 'crypto';

/**
 * Xendit Invoice API `payment_methods` whitelist. When passed, the hosted
 * invoice page only shows these channels — anything else is hidden.
 * Values come from https://docs.xendit.co/invoice — keep this narrow on
 * purpose so the checkout matches the badges shown on our own page.
 */
/**
 * Active payment methods. GrabPay + ShopeePay were intentionally removed
 * from the offer — re-add to the union if you ever re-enable them.
 */
export type XenditPaymentMethod =
  | 'CREDIT_CARD'
  | 'GCASH'
  | 'PAYMAYA'
  | 'BPI'
  | 'BDO'
  | 'UNIONBANK';

export const DEFAULT_PAYMENT_METHODS: XenditPaymentMethod[] = [
  'CREDIT_CARD',
  'GCASH',
  'PAYMAYA',
];

/**
 * Payment-method groups exposed as explicit buttons on the checkout. Each
 * group resolves to a Xendit `payment_methods` array — when /api/checkout
 * passes a group, the hosted invoice page only shows those channels (so a
 * buyer who clicked "Pay via GCash" lands directly on GCash, not the
 * Xendit method-picker page).
 */
export const PAYMENT_METHOD_GROUPS = {
  GCASH: ['GCASH'] as XenditPaymentMethod[],
  CREDIT_CARD: ['CREDIT_CARD'] as XenditPaymentMethod[],
  // Xendit's PH bank/direct-debit channels — buyer picks BPI/BDO/UnionBank
  // on the Xendit page after clicking "Pay via Banks" here.
  BANKS: ['BPI', 'BDO', 'UNIONBANK'] as XenditPaymentMethod[],
} as const;

export type PaymentMethodGroup = keyof typeof PAYMENT_METHOD_GROUPS;

export function resolvePaymentMethods(group: PaymentMethodGroup | undefined): XenditPaymentMethod[] {
  if (!group) return DEFAULT_PAYMENT_METHODS;
  return PAYMENT_METHOD_GROUPS[group] ?? DEFAULT_PAYMENT_METHODS;
}

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
  // Use timingSafeEqual to defend against subtle timing-leak attacks.
  const expected = process.env.XENDIT_WEBHOOK_TOKEN;
  if (!expected) {
    console.warn('[xendit] XENDIT_WEBHOOK_TOKEN unset — refusing all callbacks.');
    return false;
  }
  if (!headerToken) return false;
  const a = Buffer.from(headerToken, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
