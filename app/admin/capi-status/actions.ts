'use server';

/**
 * Server actions for /admin/capi-status.
 *
 * Lives in its own 'use server' file rather than inline in page.tsx so
 * Next 14 registers the action as a stable endpoint. The previous setup
 * defined the action at module scope in page.tsx with only an inline
 * 'use server' directive AND passed it as a prop to a child component —
 * that combo silently no-op'd on submit in production.
 */

import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin-auth';
import { getSignups } from '@/lib/db';
import { sendCapiEvent } from '@/lib/meta';
import { OFFER } from '@/lib/config';

/** Re-fire a Purchase CAPI event for a paid signup. */
export async function refireCapiForAction(formData: FormData): Promise<void> {
  requireAdmin();
  const id = String(formData.get('id') || '');
  if (!id) redirect('/admin/capi-status?refire=missing-id');

  const all = await getSignups();
  const s = all.find((x) => x.id === id);
  if (!s) redirect('/admin/capi-status?refire=not-found');

  const meta = (s!.metadata as { meta?: Record<string, string> } | undefined)?.meta ?? {};
  const ext = (s!.metadata as { externalId?: string } | undefined)?.externalId ?? id;
  const bumped = Boolean(s!.bumped);
  const amountPhp = (s!.amountCentavos ?? 0) / 100;

  const result = await sendCapiEvent({
    eventName: 'Purchase',
    // Reuse the original purchaseEventId so Meta dedupes against the
    // Xendit-webhook fire. If missing (rare — pre-CAPI signups), generate
    // a refire-tagged id so we can still tell them apart in diagnostics.
    eventId: meta.purchaseEventId ?? `purchase_${ext}_refire_${Date.now()}`,
    eventSourceUrl: meta.sourceUrl,
    userData: {
      email: s!.email,
      phone: s!.phone,
      firstName: s!.firstName,
      lastName: s!.lastName,
      fbp: meta.fbp,
      fbc: meta.fbc,
      clientIp: meta.clientIp,
      clientUserAgent: meta.clientUserAgent,
      country: 'ph',
      externalId: ext,
    },
    customData: {
      value: amountPhp,
      currency: 'PHP',
      contentName: bumped ? `${OFFER.main.name} + ${OFFER.oto.name}` : OFFER.main.name,
      contentIds: [bumped ? `${OFFER.main.sku}+${OFFER.oto.sku}` : OFFER.main.sku],
      numItems: bumped ? 2 : 1,
    },
  });

  const status = result.ok
    ? `ok-${('eventsReceived' in result && result.eventsReceived) ?? '?'}-${result.provider}`
    : `fail-${encodeURIComponent(result.error.slice(0, 60))}`;
  redirect(`/admin/capi-status?refireId=${encodeURIComponent(id)}&refireStatus=${status}`);
}
