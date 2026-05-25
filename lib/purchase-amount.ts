/**
 * Shared purchase-amount resolver used by both /oto and /thank-you so the
 * Meta Pixel Purchase event reports the same value from either landing
 * page. Single source of truth — Meta's dedup eventID still keeps the two
 * fires from double-counting.
 *
 * Sources, in priority order:
 *   1. The signup row's amountCentavos (set at checkout time and bumped
 *      again by the Xendit webhook on OTO confirm) — most accurate.
 *   2. The OFFER price config — fallback when the row isn't found
 *      (e.g. the signup ID was malformed or the row was deleted).
 */

import { getSignups } from './db';
import { OFFER } from './config';

export type PurchaseAmount = {
  /** PHP major units (e.g. 999.00). Pixel + CAPI expect non-centavo. */
  value: number;
  /** True when this purchase included the OTO bundle. */
  bumped: boolean;
};

export async function resolvePurchaseAmount(
  orderId: string | undefined,
  /**
   * "1" when the user took the OTO upsell after the main checkout
   * (separate Xendit invoice). Distinct from the in-checkout bump,
   * which is already reflected in the signup's amountCentavos.
   */
  otoParam: string | undefined,
): Promise<PurchaseAmount> {
  const didOto = otoParam === '1';
  if (!orderId) {
    return {
      value: (OFFER.main.priceCentavos + (didOto ? OFFER.oto.priceCentavos : 0)) / 100,
      bumped: didOto,
    };
  }
  try {
    const signups = await getSignups();
    const signup = signups.find((s) => {
      const meta = s.metadata as { externalId?: string } | undefined;
      return meta?.externalId === orderId;
    });
    const base = (signup?.amountCentavos ?? OFFER.main.priceCentavos) / 100;
    // If the user took the OTO via separate invoice after checkout but the
    // bump was NOT in the original signup amount, add it here so Meta sees
    // the full LTV in a single Purchase event.
    const addedOto = didOto && !signup?.bumped ? OFFER.oto.priceCentavos / 100 : 0;
    return {
      value: base + addedOto,
      bumped: Boolean(signup?.bumped) || didOto,
    };
  } catch {
    return {
      value: (OFFER.main.priceCentavos + (didOto ? OFFER.oto.priceCentavos : 0)) / 100,
      bumped: didOto,
    };
  }
}
