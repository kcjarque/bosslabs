import { NextResponse } from 'next/server';
import { isAdminLoggedIn, isSameOrigin } from '@/lib/admin-auth';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

export const runtime = 'nodejs';

const BUCKET = 'email-assets';
const MAX_BYTES = 8 * 1024 * 1024;

/** Admin-only image upload → public Supabase Storage URL (for email templates). */
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
    return NextResponse.json({ error: 'Image must be under 8MB.' }, { status: 413 });
  }
  if (file.type && !file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Please upload an image.' }, { status: 415 });
  }

  const rawName = (file as File).name ?? 'image.jpg';
  const ext = (rawName.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const key = `email/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sb = getSupabase();
  const { error } = await sb.storage.from(BUCKET).upload(key, bytes, {
    contentType: file.type || 'image/jpeg',
    upsert: false,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const { data } = sb.storage.from(BUCKET).getPublicUrl(key);
  return NextResponse.json({ url: data.publicUrl });
}
