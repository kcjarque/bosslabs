'use client';

/**
 * PurchasePixel — fires the Meta Pixel `Purchase` event when the user
 * lands on /thank-you. Uses `purchase_${orderId}` as the eventID so it
 * deduplicates with the server-side CAPI Purchase event fired by the
 * Xendit webhook.
 *
 * Renders nothing — just side-effects on mount.
 */

import { useEffect, useRef } from 'react';
import { trackPixelEvent } from '@/lib/meta-client';

export function PurchasePixel({
  orderId,
  value,
  bumped,
}: {
  orderId: string;
  value: number; // in PHP major units
  bumped: boolean;
}) {
  // useRef guards against React strict-mode double-invocation in dev so
  // we don't fire two Purchase events on every page load.
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    if (!orderId) return;
    fired.current = true;

    trackPixelEvent(
      'Purchase',
      {
        value,
        currency: 'PHP',
        content_name: bumped
          ? 'BOSSLABS AI Webinar + 1:1 Audit'
          : 'BOSSLABS AI Webinar',
        content_ids: [bumped ? 'BL_WEBINAR_LIVE+BL_OTO_AUDIT' : 'BL_WEBINAR_LIVE'],
        num_items: bumped ? 2 : 1,
      },
      `purchase_${orderId}`,
    );
  }, [orderId, value, bumped]);

  return null;
}
