/**
 * Engagement layer (SPEC §1.3) — channel-aware interaction log + click-driven
 * lead tagging, built on top of the redirect layer (§1.3.1). Every helper is
 * best-effort and never throws: it runs on the click hot path and the send path,
 * where a logging hiccup must never break a redirect or a send.
 */
import { randomBytes } from 'crypto';
import { getSupabase, isSupabaseConfigured } from './supabase';
import { getOffers } from './offers';

export type Channel = 'email' | 'sms';
export type EngagementEvent = 'sent' | 'open' | 'click' | 'reply' | 'bounce' | 'unsub';

/** link_tags that map to a purchasable offer → a click means buying-intent. */
const OFFER_TAGS: Record<string, string> = {
  retreat: 'retreat',
  dfy: 'dfy',
  vault: 'vault',
  oto_1on1: 'oto_1on1',
};

/** Non-offer tags → where their click should land (own domain only). Some point
 *  at pages built in later phases; the click still tracks regardless. */
const STATIC_TARGETS: Record<string, string> = {
  webinar: 'https://www.bosslabs.live/',
  systems: 'https://www.bosslabs.live/systems',
  community: 'https://www.facebook.com/share/g/18iYKmoNPc/',
  replay: 'https://www.bosslabs.live/replay',
  survey: 'https://www.bosslabs.live/survey',
  // TODO(Kyle §12.9): real Facebook Reviews page URL
  review: 'https://www.facebook.com/',
  // TODO(Kyle §12.8): real Manus 101 access page on bosslabsai.com
  freebie: 'https://www.bosslabsai.com/',
  freebie_l1_done: 'https://www.bosslabsai.com/',
};

const FALLBACK_URL = 'https://www.bosslabs.live/';

/** Resolve a link_tag to its redirect target. Offer tags read the live offers
 *  table (so a link can never point at a stale price/cohort); others use the map. */
export async function resolveTagTarget(tag: string): Promise<string> {
  const offerKey = OFFER_TAGS[tag];
  if (offerKey) {
    const offers = await getOffers();
    if (offers[offerKey]?.targetUrl) return offers[offerKey]!.targetUrl!;
  }
  return STATIC_TARGETS[tag] ?? FALLBACK_URL;
}

/** Record one engagement event. Best-effort. */
export async function logEngagementEvent(input: {
  contactId?: string | null;
  templateKey?: string | null;
  channel: Channel;
  event: EngagementEvent;
  linkTag?: string | null;
}): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    await getSupabase().from('engagement_events').insert({
      contact_id: input.contactId ?? null,
      template_key: input.templateKey ?? null,
      channel: input.channel,
      event: input.event,
      link_tag: input.linkTag ?? null,
    });
  } catch (err) {
    console.warn('[engagement] log skipped:', err instanceof Error ? err.message : err);
  }
}

/** A click on a tagged link marks the contact engaged (last_engaged_at), and for
 *  an offer tag stamps `interested:<offer>` so segments are one indexed query.
 *  A `replay` click also flips watched_replay on their attendance (Track A gate). */
export async function tagContactFromClick(contactId: string, linkTag: string | null): Promise<void> {
  if (!isSupabaseConfigured() || !contactId) return;
  const now = new Date().toISOString();
  try {
    const sb = getSupabase();
    const { data } = await sb.from('signups').select('interest_tags').eq('id', contactId).maybeSingle();
    if (!data) return;
    const cur = (data as { interest_tags?: string[] }).interest_tags;
    const tags = Array.isArray(cur) ? cur : [];
    const patch: Record<string, unknown> = { last_engaged_at: now };
    const offerKey = linkTag ? OFFER_TAGS[linkTag] : undefined;
    if (offerKey) {
      const tag = `interested:${offerKey}`;
      if (!tags.includes(tag)) patch.interest_tags = [...tags, tag];
    }
    await sb.from('signups').update(patch).eq('id', contactId);
    if (linkTag === 'replay') {
      await sb.from('event_attendance').update({ watched_replay: true }).eq('contact_id', contactId);
    }
  } catch (err) {
    console.warn('[engagement] tag skipped:', err instanceof Error ? err.message : err);
  }
}

const SLUG_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no 0/o/1/l/i ambiguity
function genSlug(): string {
  const bytes = randomBytes(6);
  let s = '';
  for (let i = 0; i < 6; i++) s += SLUG_ALPHABET[bytes[i] % SLUG_ALPHABET.length];
  return s;
}

/** Mint a per-contact short link for an SMS-bound tagged URL → `bosslabs.live/l/{slug}`.
 *  Returns the slug, or null on failure so the SMS renderer can fall back to the
 *  raw URL (a text must still send). */
export async function createShortLink(input: {
  contactId?: string | null;
  linkTag: string;
  channel: Channel;
  targetUrl: string;
}): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const sb = getSupabase();
    for (let i = 0; i < 4; i++) {
      const slug = genSlug();
      const { error } = await sb.from('short_links').insert({
        slug,
        contact_id: input.contactId ?? null,
        link_tag: input.linkTag,
        channel: input.channel,
        target_url: input.targetUrl,
      });
      if (!error) return slug;
    }
    return null;
  } catch {
    return null;
  }
}

export async function resolveShortLink(
  slug: string,
): Promise<{ contactId: string | null; linkTag: string | null; channel: Channel; targetUrl: string } | null> {
  if (!isSupabaseConfigured() || !slug) return null;
  try {
    const { data } = await getSupabase()
      .from('short_links')
      .select('contact_id, link_tag, channel, target_url')
      .eq('slug', slug)
      .maybeSingle();
    if (!data) return null;
    const r = data as { contact_id: string | null; link_tag: string | null; channel: string | null; target_url: string };
    return {
      contactId: r.contact_id,
      linkTag: r.link_tag,
      channel: (r.channel === 'email' ? 'email' : 'sms') as Channel,
      targetUrl: r.target_url,
    };
  } catch {
    return null;
  }
}
