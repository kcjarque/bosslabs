/**
 * /api/affiliate/video/confirm — after the browser finishes the direct upload,
 * record the video row (so it shows in the affiliate's dashboard + admin) and
 * ping the owner. The path must live under the affiliate's own folder.
 */
import { NextResponse } from 'next/server';
import { isSameOrigin } from '@/lib/admin-auth';
import { getAffiliateByToken, addAffiliateVideo } from '@/lib/affiliates';
import { sendTelegram, esc } from '@/lib/telegram';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as {
    token?: string;
    path?: string;
    originalName?: string;
    contentType?: string;
    size?: number;
  };
  const aff = await getAffiliateByToken((body.token || '').trim());
  if (!aff) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const path = (body.path || '').trim();
  if (!path.startsWith(`${aff.id}/`)) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  await addAffiliateVideo({
    affiliateId: aff.id,
    path,
    originalName: body.originalName || 'video',
    contentType: body.contentType || '',
    sizeBytes: Number(body.size || 0),
  });

  await sendTelegram(
    `🎬 <b>New affiliate testimonial video!</b>\n\n` +
      `<b>${esc(aff.name)}</b>\n${esc(aff.email)}\n` +
      `File: ${esc(body.originalName || 'video')}\n` +
      `Review + download it in admin → Affiliates.`,
  ).catch(() => null);

  return NextResponse.json({ ok: true });
}
