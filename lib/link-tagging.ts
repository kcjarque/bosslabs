/**
 * Render-time link tagging (SPEC §5.2). Instead of editing every template body,
 * we rewrite outbound links at SEND time:
 *   - Email: <a href="…offer url…"> → /api/l/{tag}?c={contactId}&u={originalUrl}
 *   - SMS:   https://…offer url…    → bosslabs.live/l/{slug} (per-contact short link)
 * Non-offer links are left untouched, so nothing that works breaks. The `u`
 * param preserves the exact destination (incl. promo params); the /api/l route
 * only honours it when it's on our allow-list, so there's no open-redirect.
 */
import { createShortLink } from './engagement';

const SMS_BASE = 'https://bosslabs.live';

/** Hosts the /api/l redirect will forward a `u` param to. Everything else falls
 *  back to the tag's canonical target. */
export const ALLOWED_REDIRECT_HOSTS = [
  'bosslabs.live',
  'www.bosslabs.live',
  'bosslabsai.com',
  'www.bosslabsai.com',
  'facebook.com',
  'www.facebook.com',
  'm.me',
];

export function safeRedirectU(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return ALLOWED_REDIRECT_HOSTS.includes(parsed.hostname) ? u : null;
  } catch {
    return null;
  }
}

/**
 * Re-sign a token-gated destination at redirect time.
 *
 * `/survey?c=…` carries an HMAC of the signup id, signed with ADMIN_COOKIE_SECRET.
 * Anything that mints that URL outside production signs it with a DIFFERENT key
 * — `vercel env pull` deliberately returns encrypted secrets empty, so a local
 * backfill script silently falls back to the dev secret. The survey page then
 * can't verify the signature and shows "Link expired", which is what happened to
 * 631 already-delivered survey links on 2026-07-29.
 *
 * Both redirect hops (/l/{slug} and /api/l/{tag}) know the contact, and they run
 * IN production where the real secret lives — so re-minting the token here
 * repairs links that were already sent, with no re-send and no DB rewrite.
 * Only ever touches our own /survey path, and only when the contact is known.
 */
export function resignContactUrl(
  targetUrl: string,
  contactId: string | null | undefined,
  sign: (id: string) => string,
): string {
  if (!contactId) return targetUrl;
  try {
    const u = new URL(targetUrl);
    if (!ALLOWED_REDIRECT_HOSTS.includes(u.hostname)) return targetUrl;
    if (u.pathname !== '/survey') return targetUrl;
    u.searchParams.set('c', sign(contactId));
    return u.toString();
  } catch {
    return targetUrl;
  }
}

/** Map a destination URL to a link_tag, or null to leave it un-tracked. */
export function matchTag(rawUrl: string): string | null {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const path = u.pathname;
  const product = u.searchParams.get('product');
  if (/vibecode-retreat/.test(path)) return 'retreat';
  if (/(order-bump|\/oto)(\/|$)/.test(path) || path === '/oto') {
    return product === 'oto2' ? 'oto_1on1' : 'vault';
  }
  if (/^\/apply/.test(path)) return 'dfy';
  if (/^\/replay/.test(path)) return 'replay';
  if (/^\/survey/.test(path)) return 'survey';
  if (/^\/systems/.test(path)) return 'systems';
  if (u.hostname.includes('facebook.com') && /review/i.test(path)) return 'review';
  if (u.hostname.includes('facebook.com') && /\/share\/g\//.test(path)) return 'community';
  if (u.hostname.includes('bosslabsai.com')) return 'freebie';
  return null;
}

/** Rewrite offer/funnel <a href> links in a rendered email to tracked links.
 *  No contactId → leave links direct (can't attribute a click to nobody).
 *  templateKey (when known) rides along as `&k=` so a click records which
 *  email it came from — powering the "From email" column on the click log. */
export function rewriteEmailLinks(
  html: string,
  contactId: string | null,
  siteUrl: string,
  templateKey?: string | null,
): string {
  if (!contactId) return html;
  const kParam = templateKey ? `&k=${encodeURIComponent(templateKey)}` : '';
  return html.replace(/href="([^"]+)"/g, (whole, url: string) => {
    // Don't double-wrap already-tracked links.
    if (url.includes('/api/l/') || url.includes('/l/')) return whole;
    const tag = matchTag(url);
    if (!tag) return whole;
    return `href="${siteUrl}/api/l/${tag}?c=${encodeURIComponent(contactId)}&u=${encodeURIComponent(url)}${kParam}"`;
  });
}

/** Rewrite offer/funnel URLs in an SMS body to per-contact short links. Async —
 *  it mints short_links rows. Falls back to the raw URL if a slug can't be
 *  created (a text must still send). */
export async function rewriteSmsLinks(body: string, contactId: string | null): Promise<string> {
  const urls = body.match(/https?:\/\/[^\s]+/g);
  if (!urls) return body;
  let out = body;
  for (const raw of urls) {
    const clean = raw.replace(/[).,!?]+$/, ''); // strip trailing punctuation
    if (clean.includes('/l/')) continue;
    const tag = matchTag(clean);
    if (!tag) continue;
    const slug = await createShortLink({ contactId, linkTag: tag, channel: 'sms', targetUrl: clean });
    if (slug) out = out.replace(clean, `${SMS_BASE}/l/${slug}`);
  }
  return out;
}
