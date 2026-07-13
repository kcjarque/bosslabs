/**
 * SMS click-tracking redirect (SPEC §1.3.1 short form): bosslabs.live/l/{slug}
 * → looks up the per-contact short link, logs the click on its stored channel,
 * tags interest, then 302s to the target. Slugs + targets are minted by us
 * (createShortLink), so there's no open-redirect surface.
 */
import { NextResponse } from 'next/server';
import { logEngagementEvent, tagContactFromClick, resolveShortLink } from '@/lib/engagement';
import { enrollFromOfferClick } from '@/lib/sos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FALLBACK = 'https://www.bosslabs.live/';

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const link = await resolveShortLink(params.slug);
  if (!link) return NextResponse.redirect(FALLBACK, 302);
  await logEngagementEvent({
    contactId: link.contactId,
    channel: link.channel,
    event: 'click',
    linkTag: link.linkTag,
  });
  if (link.contactId) {
    await tagContactFromClick(link.contactId, link.linkTag);
    if (link.linkTag) await enrollFromOfferClick(link.contactId, link.linkTag);
  }
  return NextResponse.redirect(link.targetUrl, 302);
}
