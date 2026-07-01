/**
 * GET /api/admin/ads/preview?id=<ad_id>&format=<AD_PREVIEW_FORMAT>
 *
 * Wraps Meta's /{ad_id}/previews endpoint. Returns the iframe src/width/height
 * so the client can drop it into a sandboxed <iframe>. Admin-gated because the
 * shared BM token has ads_read scope and we don't expose it to end-users.
 */
import { NextResponse } from 'next/server';
import { isAdminLoggedIn, isSameOrigin } from '@/lib/admin-auth';
import { getAdPreview, type AdPreviewFormat, AD_PREVIEW_FORMATS } from '@/lib/meta-ads';

export const runtime = 'nodejs';

const VALID_FORMATS = new Set<string>(AD_PREVIEW_FORMATS.map((f) => f.key));

export async function GET(req: Request) {
  if (!isAdminLoggedIn()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  const formatRaw = url.searchParams.get('format') || 'DESKTOP_FEED_STANDARD';
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const format = (VALID_FORMATS.has(formatRaw) ? formatRaw : 'DESKTOP_FEED_STANDARD') as AdPreviewFormat;
  const result = await getAdPreview(id, format);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  // Return the raw iframe HTML too — some previews render blank when the src
  // is dropped into a *different* iframe (sandbox conflicts, referer checks),
  // but Meta's own <iframe> tag renders reliably when injected verbatim.
  return NextResponse.json({
    src: result.src,
    width: result.width,
    height: result.height,
    html: result.raw,
  });
}
