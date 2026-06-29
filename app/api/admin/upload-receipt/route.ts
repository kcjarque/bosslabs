/**
 * Admin-only receipt upload → public Supabase Storage URL. Used by the
 * expenses form to attach a screenshot or PDF receipt to a logged expense.
 *
 * Mirrors /api/admin/upload-image but accepts PDF in addition to images
 * (receipts come both ways — phone screenshot OR a PDF from a bank app).
 * Stored in the same `email-assets` bucket under a `receipts/` prefix so
 * we don't need to provision a second bucket.
 */
import { NextResponse } from 'next/server';
import { isAdminLoggedIn, isSameOrigin } from '@/lib/admin-auth';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

export const runtime = 'nodejs';

const BUCKET = 'email-assets';
const MAX_BYTES = 12 * 1024 * 1024; // 12MB — PDFs from bank apps run bigger than typical screenshots
const ALLOWED_TYPES = /^(image\/|application\/pdf$)/;

export async function POST(req: Request) {
  if (!isAdminLoggedIn()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Storage is not configured.' }, { status: 500 });
  }

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File must be under 12 MB.' }, { status: 413 });
  }
  if (file.type && !ALLOWED_TYPES.test(file.type)) {
    return NextResponse.json({ error: 'Please upload an image or PDF.' }, { status: 415 });
  }

  const rawName = (file as File).name ?? 'receipt';
  const ext = (rawName.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const key = `receipts/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sb = getSupabase();
  const { error } = await sb.storage.from(BUCKET).upload(key, bytes, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const { data } = sb.storage.from(BUCKET).getPublicUrl(key);
  return NextResponse.json({ url: data.publicUrl });
}
