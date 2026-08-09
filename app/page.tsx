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
import { readAbTest, resolveAbVariant, type VariantKey } from '@/lib/ab';

// Render per-request so the live webinar date/time/countdown always reflect
// the current Settings. Without this the homepage is statically cached at
// build time and keeps showing whichever event was active at deploy.
export const dynamic = 'force-dynamic';

/**
 * Homepage A/B test. Which two designs run, the traffic split, and whether the
 * test is live at all are all managed from admin → Funnels (stored in the
 * webinar funnel's config; see lib/ab.ts). The public URL never changes — the
 * split is server-side off the sticky bl_ab_roll cookie, so the ad link
 * https://www.bosslabs.live is untouched.
 *
 * Attribution: checkout stamps metadata.homeVariant (arm) + homeVariantKey
 * (the actual design) from the SAME config, so per-design revenue stays
 * correct even after the variants are swapped for a later test.
 */
type HomeVariant = VariantKey;

/** ?preview=… forces a design for THIS request only — no cookie change, and
 *  the beacon is skipped so admin peeks never pollute the test data. */
function previewOverride(preview?: string): HomeVariant | null {
  if (preview === 'control' || preview === 'a') return 'control';
  if (preview === 'd') return 'd';
  if (preview === 'b') return 'b';
  if (preview === 'c') return 'c';
  return null;
}

/** getFunnels is React-cache()'d, so generateMetadata and the page render
 *  share a single fetch per request. */
async function resolveVariant(
  preview?: string,
): Promise<{ variant: HomeVariant; arm: 'a' | 'b' }> {
  const forced = previewOverride(preview);
  let test;
  try {
    const funnels = await getFunnels();
    const cfg = funnels.find((f) => f.slug === 'webinar')?.config as
      | Record<string, unknown>
      | undefined;
    test = readAbTest(cfg);
  } catch {
    test = readAbTest(null); // config unreadable → safe defaults
  }
  const resolved = resolveAbVariant(test, (await cookies()).get('bl_ab_roll')?.value);
  return { variant: forced ?? resolved.variant, arm: resolved.arm };
}

/** Variant D reframes the promise, so its meta/OG must message-match the new
 *  H1 (SPEC §6). Every other variant keeps the control metadata. */
export async function generateMetadata(
  props: {
    searchParams?: Promise<{ preview?: string }>;
  }
): Promise<Metadata> {
  const searchParams = await props.searchParams;
  const { variant } = await resolveVariant(searchParams?.preview);
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

export default async function Page(
  props: {
    searchParams?: Promise<{ preview?: string }>;
  }
) {
  const searchParams = await props.searchParams;
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
  const { variant, arm } = await resolveVariant(preview);

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
      {/* One view beacon per ARM (not per design) so visit counts stay
          comparable across a variant swap. Skipped on ?preview so admin peeks
          never pollute the test. */}
      {!preview && <AbBeacon path={`/__ab/home-${arm}`} />}
      <ExitIntentModal />
    </>
  );
}
