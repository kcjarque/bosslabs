import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { OptInPage } from '@/components/OptInPage';
import { OptInPageB } from '@/components/variant-b/OptInPageB';
import { OptInPageC } from '@/components/variant-c/OptInPageC';
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
 * Homepage split test (GHL-style). Three variants:
 *   - control (components/OptInPage.tsx) — the original
 *   - b (components/variant-b/OptInPageB.tsx) — conversion-first rebuild
 *   - c (components/variant-c/OptInPageC.tsx) — competition-killer informed
 *     by the aibuilderssummit.live audit (outcome-first hero, itemized
 *     bonus, sharpened apps moat)
 *
 * Assignment:
 *   - middleware gives every visitor a sticky random roll 0-99 (bl_ab_roll);
 *   - the webinar funnel exposes TWO traffic dials in admin → Funnels:
 *       homeVariantPct  → traffic % for variant B
 *       homeVariantCPct → traffic % for variant C
 *   - bucketing: roll < pctB → B, else roll < pctB + pctC → C, else control.
 *     Additive so raising pctC doesn't reshuffle anyone already in B.
 *   - ?preview=b / ?preview=c / ?preview=control force a variant for preview
 *     (no cookie change, works even at 0% live traffic).
 */
export default async function Page({
  searchParams,
}: {
  searchParams?: { preview?: string };
}) {
  const webinar = await getWebinarInfo();

  let pctB = 0;
  let pctC = 0;
  try {
    const funnels = await getFunnels();
    const cfg = funnels.find((f) => f.slug === 'webinar')?.config as
      | { homeVariantPct?: number; homeVariantCPct?: number }
      | undefined;
    pctB = Math.min(100, Math.max(0, Number(cfg?.homeVariantPct) || 0));
    pctC = Math.min(100, Math.max(0, Number(cfg?.homeVariantCPct) || 0));
  } catch {
    pctB = 0;
    pctC = 0; // config unreadable → everyone sees control (fail-safe)
  }

  // Cap combined at 100 to keep behavior sane if admin overlaps sliders.
  const cBound = Math.min(100, pctB + pctC);
  const roll = Number(cookies().get('bl_ab_roll')?.value ?? NaN);
  let variant: 'control' | 'b' | 'c' = 'control';
  if (Number.isFinite(roll)) {
    if (roll < pctB) variant = 'b';
    else if (roll < cBound) variant = 'c';
  }
  const preview = searchParams?.preview;
  if (preview === 'b') variant = 'b';
  if (preview === 'c') variant = 'c';
  if (preview === 'control' || preview === 'a') variant = 'control';

  const page =
    variant === 'b' ? (
      <OptInPageB webinar={webinar} />
    ) : variant === 'c' ? (
      <OptInPageC webinar={webinar} />
    ) : (
      <OptInPage webinar={webinar} />
    );

  return (
    <>
      {page}
      {/* Log variant views (skip previews so admin peeks don't pollute data). */}
      {variant === 'b' && !preview && <AbBeacon path="/__ab/home-b" />}
      {variant === 'c' && !preview && <AbBeacon path="/__ab/home-c" />}
      <ExitIntentModal />
    </>
  );
}
