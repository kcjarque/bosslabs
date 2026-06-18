/**
 * /api/affiliate/signup — public self-serve affiliate sign-up.
 *
 * Creates an active affiliate at the standard rate and returns their share link
 * (/r/<code>) + dashboard (/affiliate/<token>) so they can start promoting
 * immediately. Commission is performance-based (only paid on real referred
 * sales), so instant activation is safe; the admin can adjust any rate later.
 * Re-signing up with the same email returns the existing affiliate (no dupes).
 */
import { NextResponse } from 'next/server';
import { isSameOrigin } from '@/lib/admin-auth';
import {
  listAffiliates,
  getAffiliateByCode,
  createAffiliate,
  slugifyCode,
  randomAffiliateCode,
  AFFILIATE_DEFAULT_PERCENT,
} from '@/lib/affiliates';
import { siteUrl } from '@/lib/site';
import { sendTelegram, esc } from '@/lib/telegram';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    if (!isSameOrigin(req)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      email?: string;
      promo?: string;
    };
    const name = (body.name || '').trim();
    const email = (body.email || '').trim().toLowerCase();
    if (!name || !email.includes('@')) {
      return NextResponse.json({ error: 'Please enter your name and a valid email.' }, { status: 400 });
    }

    const base = siteUrl(req);
    const link = (code: string) => `${base}/r/${code}`;
    const dash = (token: string) => `${base}/affiliate/${token}`;

    // Already an affiliate with this email? Return their existing link — re-signing
    // up should just hand them back their dashboard, not mint a duplicate.
    const existing = (await listAffiliates()).find((a) => a.email.toLowerCase() === email);
    if (existing) {
      return NextResponse.json({
        ok: true,
        existing: true,
        code: existing.code,
        link: link(existing.code),
        dashboardUrl: dash(existing.dashboardToken),
      });
    }

    // Friendly code from the name (bosslabs.live/r/juandelacruz); fall back to a
    // random suffix if that slug is taken, or a random code if the name has none.
    let code = slugifyCode(name);
    if (!code) {
      code = randomAffiliateCode();
    } else if (await getAffiliateByCode(code)) {
      code = `${code}-${randomAffiliateCode().slice(0, 4)}`;
    }

    const aff = await createAffiliate({
      code,
      name,
      email,
      commissionType: 'percent',
      commissionValue: AFFILIATE_DEFAULT_PERCENT,
    });

    // Best-effort owner ping so you know who joined + how they'll promote.
    const promo = (body.promo || '').trim();
    await sendTelegram(
      `🤝 <b>New affiliate signed up!</b>\n\n` +
        `<b>${esc(aff.name)}</b>\n${esc(aff.email)}\n` +
        `Link: <code>${link(aff.code)}</code>` +
        (promo ? `\n\n<i>How they'll promote:</i>\n${esc(promo)}` : ''),
    ).catch(() => null);

    return NextResponse.json({
      ok: true,
      code: aff.code,
      link: link(aff.code),
      dashboardUrl: dash(aff.dashboardToken),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
