/**
 * Email click-tracking redirect (SPEC §5.2 long form): /api/l/{tag}?c={contactId}
 * → logs the click to engagement_events, tags the contact's interest, then 302s
 * to the tag's real destination. Targets are resolved from a controlled map /
 * the offers table (never from user input), so there's no open-redirect surface.
 */
import { NextResponse } from 'next/server';
import { logEngagementEvent, tagContactFromClick, resolveTagTarget } from '@/lib/engagement';
import { safeRedirectU } from '@/lib/link-tagging';
import { enrollFromOfferClick } from '@/lib/sos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { tag: string } }) {
  const tag = params.tag;
  const sp = new URL(req.url).searchParams;
  const contactId = sp.get('c');
  const templateKey = sp.get('k'); // which email carried the link (see rewriteEmailLinks)
  // Preserve the exact destination when it's on our allow-list; else fall back
  // to the tag's canonical target (so a link can never point at a stale price).
  const target = safeRedirectU(sp.get('u')) ?? (await resolveTagTarget(tag));
  // Await the writes — the tracking IS the point of this hop; a small delay on a
  // click redirect is fine, and both helpers are best-effort (never throw).
  await logEngagementEvent({ contactId, channel: 'email', event: 'click', linkTag: tag, templateKey });
  if (contactId) {
    await tagContactFromClick(contactId, tag);
    // Click-triggered SOS enrollment (§6-9). No-op unless the offer's SOS
    // sequence is active + the contact isn't already enrolled.
    await enrollFromOfferClick(contactId, tag);
  }
  return NextResponse.redirect(target, 302);
}
