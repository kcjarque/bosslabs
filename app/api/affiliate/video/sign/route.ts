/**
 * /api/affiliate/video/sign — issue a one-time signed upload URL so the
 * affiliate's browser can PUT a (potentially large) testimonial video straight
 * to Supabase Storage, bypassing the serverless body limit. Keyed by the
 * affiliate's dashboard token; the path is namespaced to their id.
 */
import { NextResponse } from 'next/server';
import { isSameOrigin } from '@/lib/admin-auth';
import { getAffiliateByToken, signAffiliateVideoUpload } from '@/lib/affiliates';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as {
    token?: string;
    filename?: string;
    contentType?: string;
  };
  const aff = await getAffiliateByToken((body.token || '').trim());
  if (!aff) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const signed = await signAffiliateVideoUpload(aff.id, body.filename || 'video', body.contentType || '');
  if (!signed) return NextResponse.json({ error: 'Could not start upload' }, { status: 500 });
  return NextResponse.json({ ok: true, path: signed.path, uploadUrl: signed.uploadUrl });
}
