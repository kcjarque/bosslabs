import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { OptInPage } from '@/components/OptInPage';
import { OptInPageB } from '@/components/variant-b/OptInPageB';
import { OptInPageC } from '@/components/variant-c/OptInPageC';
import { OptInPageD } from '@/components/variant-d/OptInPageD';
import { ExitIntentModal } from '@/components/ExitIntentModal';
import { AbBeacon } from '@/components/AbBeacon';
import { getWebinarInfo, formatSessionLabels } from '@/lib/webinar';
import { getSettings, getUpcomingCheckoutSessions } from '@/lib/db';
import { homeArmFromCookie } from '@/lib/ab';

// Render per-request so the live webinar date/time/countdown always reflect
// the current Settings. Without this the homepage is statically cached at
// build time and keeps showing whichever event was active at deploy.
export const dynamic = 'force-dynamic';

/**
 * Homepage A/B test (2026-07-26): a 50/50 split between the OLD funnel design
 * and the CURRENT one, to compare conversion. Same public URL — the split is
 * server-side off the sticky bl_ab_roll cookie, so the ad link
 * https://www.bosslabs.live is untouched.
 *   - A = 'control' (components/OptInPage.tsx) — the ORIGINAL design
 *   - B = 'd' (components/variant-d/OptInPageD.tsx) — the current ₱500K reframe
 * Attribution: checkout stamps metadata.homeVariant ('a'|'b') from the SAME
 * cookie (see lib/ab.ts), so per-design revenue/conversion is measurable in
 * admin. b/c are legacy experiments, reachable via ?preview only (not live).
 */
type HomeVariant = 'control' | 'b' | 'c' | 'd';

function resolveVariant(preview?: string): HomeVariant {
  // LIVE A/B test (2026-07-26): 50/50 OLD design (A = control) vs CURRENT
  // design (B = d), driven by the sticky bl_ab_roll cookie. Same public URL —
  // the ad link https://www.bosslabs.live is unchanged; the split is
  // server-side. b/c remain reachable via ?preview only (not in rotation).
  const arm = homeArmFromCookie(cookies().get('bl_ab_roll')?.value);
  let variant: HomeVariant = arm === 'a' ? 'control' : 'd';
  if (preview === 'control' || preview === 'a') variant = 'control';
  if (preview === 'd' || preview === 'b') variant = 'd';
  if (preview === 'c') variant = 'c';
  return variant;
}

/** Variant D reframes the promise, so its meta/OG must message-match the new
 *  H1 (SPEC §6). Every other variant keeps the control metadata. */
export async function generateMetadata({
  searchParams,
}: {
  searchParams?: { preview?: string };
}): Promise<Metadata> {
  const variant = resolveVariant(searchParams?.preview);
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
  const variant = resolveVariant(preview);

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
      {/* A/B test view beacons — one per arm so admin can measure sessions per
          design (skip previews so admin peeks don't pollute data). A = control
          (old), B = d (current); c is preview-only. */}
      {variant === 'control' && !preview && <AbBeacon path="/__ab/home-a" />}
      {variant === 'd' && !preview && <AbBeacon path="/__ab/home-b" />}
      {variant === 'c' && !preview && <AbBeacon path="/__ab/home-c" />}
      <ExitIntentModal />
    </>
  );
}
