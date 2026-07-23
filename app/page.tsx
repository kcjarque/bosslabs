import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { OptInPage } from '@/components/OptInPage';
import { OptInPageB } from '@/components/variant-b/OptInPageB';
import { OptInPageC } from '@/components/variant-c/OptInPageC';
import { OptInPageD } from '@/components/variant-d/OptInPageD';
import { ExitIntentModal } from '@/components/ExitIntentModal';
import { AbBeacon } from '@/components/AbBeacon';
import { getWebinarInfo, formatSessionLabels } from '@/lib/webinar';
import { getFunnels, getSettings, getUpcomingCheckoutSessions } from '@/lib/db';

// Render per-request so the live webinar date/time/countdown always reflect
// the current Settings. Without this the homepage is statically cached at
// build time and keeps showing whichever event was active at deploy.
export const dynamic = 'force-dynamic';

/**
 * Homepage variants. Since 2026-07-24, VARIANT D IS THE SITE DEFAULT — the
 * ₱500K-quote reframe (components/variant-d/OptInPageD.tsx) is what every
 * visitor sees at "/". The other designs are kept intact as variants:
 *   - control (components/OptInPage.tsx) — the ORIGINAL design, preserved for
 *     rollback. View via ?preview=control. To revert the whole site to it,
 *     change the `variant` fallback below from 'd' back to 'control'.
 *   - b (components/variant-b/OptInPageB.tsx) — conversion-first rebuild
 *   - c (components/variant-c/OptInPageC.tsx) — competition-killer
 *
 * Assignment:
 *   - middleware gives every visitor a sticky random roll 0-99 (bl_ab_roll);
 *   - admin → Funnels dials homeVariantPct (B) / homeVariantCPct (C) can
 *     still carve test traffic: roll < pctB → B, else roll < pctB+pctC → C,
 *     else D (the default). homeVariantDPct is now inert — D needs no dial.
 *   - ?preview=b / ?preview=c / ?preview=d / ?preview=control force a variant
 *     for preview (no cookie change).
 */
type HomeVariant = 'control' | 'b' | 'c' | 'd';

// getFunnels is React-cache()'d, so the generateMetadata call and the page
// render below share one funnels fetch per request.
async function resolveVariant(preview?: string): Promise<HomeVariant> {
  let pctB = 0;
  let pctC = 0;
  try {
    const funnels = await getFunnels();
    const cfg = funnels.find((f) => f.slug === 'webinar')?.config as
      | { homeVariantPct?: number; homeVariantCPct?: number }
      | undefined;
    const clamp = (v: unknown) => Math.min(100, Math.max(0, Number(v) || 0));
    pctB = clamp(cfg?.homeVariantPct);
    pctC = clamp(cfg?.homeVariantCPct);
  } catch {
    pctB = 0;
    pctC = 0; // config unreadable → everyone sees the default (D)
  }

  // Cap the combined bands at 100 to keep behavior sane if admin overlaps sliders.
  const cBound = Math.min(100, pctB + pctC);
  const roll = Number(cookies().get('bl_ab_roll')?.value ?? NaN);
  let variant: HomeVariant = 'd'; // ← site default; set to 'control' to revert
  if (Number.isFinite(roll)) {
    if (roll < pctB) variant = 'b';
    else if (roll < cBound) variant = 'c';
  }
  if (preview === 'b') variant = 'b';
  if (preview === 'c') variant = 'c';
  if (preview === 'd') variant = 'd';
  if (preview === 'control' || preview === 'a') variant = 'control';
  return variant;
}

/** Variant D reframes the promise, so its meta/OG must message-match the new
 *  H1 (SPEC §6). Every other variant keeps the control metadata. */
export async function generateMetadata({
  searchParams,
}: {
  searchParams?: { preview?: string };
}): Promise<Metadata> {
  const variant = await resolveVariant(searchParams?.preview);
  if (variant === 'd') {
    const title = 'Build Your ₱500K System Yourself — BOSSLABS AI';
    const description =
      '₱500K ang quote sa system mo? Build your own automated system and save ₱100K/month in under 24 hours — no developer, no coding experience. Live on Zoom, July 29.';
    return {
      title,
      description,
      openGraph: { title, description, type: 'website' },
    };
  }
  return {
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
}

export default async function Page({
  searchParams,
}: {
  searchParams?: { preview?: string };
}) {
  const webinar = await getWebinarInfo();

  // Same source + visible-count clamp as the checkout session picker, so the
  // homepage WHEN card never promises a session checkout won't actually offer.
  let upcomingSessions: { dateLabel: string; timeLabel: string }[] = [];
  try {
    const [settings, upcoming] = await Promise.all([
      getSettings(),
      getUpcomingCheckoutSessions(2),
    ]);
    const limit = settings?.checkoutSessionsVisible ?? 2;
    upcomingSessions = upcoming
      .slice(0, Math.max(1, limit))
      .map((e) => formatSessionLabels(e.startsAtIso, e.timezone));
  } catch {
    upcomingSessions = []; // falls back to the single settings-based date
  }

  const preview = searchParams?.preview;
  const variant = await resolveVariant(preview);

  const page =
    variant === 'b' ? (
      <OptInPageB webinar={webinar} upcomingSessions={upcomingSessions} />
    ) : variant === 'c' ? (
      <OptInPageC webinar={webinar} upcomingSessions={upcomingSessions} />
    ) : variant === 'd' ? (
      <OptInPageD webinar={webinar} upcomingSessions={upcomingSessions} />
    ) : (
      <OptInPage webinar={webinar} upcomingSessions={upcomingSessions} />
    );

  return (
    <>
      {page}
      {/* Log variant views (skip previews so admin peeks don't pollute data).
          D is the site default now — no beacon for it, or every homepage view
          would double-log a page_views row; plain homepage traffic counts it. */}
      {variant === 'b' && !preview && <AbBeacon path="/__ab/home-b" />}
      {variant === 'c' && !preview && <AbBeacon path="/__ab/home-c" />}
      <ExitIntentModal />
    </>
  );
}
