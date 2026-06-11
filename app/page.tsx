import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { OptInPage } from '@/components/OptInPage';
import { OptInPageB } from '@/components/variant-b/OptInPageB';
import { ExitIntentModal } from '@/components/ExitIntentModal';
import { AbBeacon } from '@/components/AbBeacon';
import { getWebinarInfo } from '@/lib/webinar';
import { getFunnels } from '@/lib/db';

// Render per-request so the live webinar date/time/countdown always reflect
// the current Settings. Without this the homepage is statically cached at
// build time and keeps showing whichever event was active at deploy.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Reserve a Seat — BOSSLABS AI · For Filipino Business Owners',
  description:
    'How to build an automated business and save at least ₱100K/month using Claude Code — without hiring a single developer. Live webinar.',
  openGraph: {
    title: 'BOSSLABS AI — The Webinar',
    description:
      'Build an automated business and save at least ₱100K/month using Claude Code, without a single developer.',
    type: 'website',
  },
};

/**
 * Homepage split test (GHL-style). Control = the current page; variation 'b'
 * is a full conversion-first rebuild (components/variant-b/OptInPageB.tsx).
 * Assignment:
 *   - middleware gives every visitor a sticky random roll 0-99 (bl_ab_roll);
 *   - the webinar funnel's homeVariantPct (admin → Funnels) is the traffic %;
 *   - variant shows when roll < pct, so 0% = nobody, and raising the % only
 *     ADDS visitors without reshuffling anyone already bucketed.
 *   - ?preview=b / ?preview=control force a variant for preview (no cookie
 *     change, works even at 0%).
 */
export default async function Page({
  searchParams,
}: {
  searchParams?: { preview?: string };
}) {
  const webinar = await getWebinarInfo();

  let pct = 0;
  try {
    const funnels = await getFunnels();
    const raw = funnels.find((f) => f.slug === 'webinar')?.config?.homeVariantPct;
    pct = Math.min(100, Math.max(0, Number(raw) || 0));
  } catch {
    pct = 0; // config unreadable → everyone sees control (fail-safe)
  }

  const roll = Number(cookies().get('bl_ab_roll')?.value ?? NaN);
  let variant: 'control' | 'b' = Number.isFinite(roll) && roll < pct ? 'b' : 'control';
  const preview = searchParams?.preview;
  if (preview === 'b') variant = 'b';
  if (preview === 'control' || preview === 'a') variant = 'control';

  return (
    <>
      {variant === 'b' ? <OptInPageB webinar={webinar} /> : <OptInPage webinar={webinar} />}
      {/* Log variant views (skip previews so admin peeks don't pollute data). */}
      {variant === 'b' && !preview && <AbBeacon path="/__ab/home-b" />}
      <ExitIntentModal />
    </>
  );
}
