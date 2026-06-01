import { NextResponse } from 'next/server';
import { getCloserSession } from '@/lib/closer-auth';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { markAbandonedCartPaid, uploadPaymentProof } from '@/lib/manual-payment';

export const runtime = 'nodejs';
const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(req: Request) {
  const closer = await getCloserSession();
  if (!closer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const form = await req.formData();
  const signupId = String(form.get('signupId') ?? '');
  const file = form.get('file');
  if (!signupId) return NextResponse.json({ error: 'Missing signupId' }, { status: 400 });

  // A closer can only confirm payment on a lead THEY claimed.
  if (isSupabaseConfigured()) {
    const { data } = await getSupabase()
      .from('closer_leads')
      .select('id')
      .eq('signup_id', signupId)
      .eq('closer_id', closer.id)
      .maybeSingle();
    if (!data) return NextResponse.json({ error: 'Not your lead.' }, { status: 403 });
  }

  let proofUrl: string | null = null;
  if (file instanceof Blob && file.size > 0) {
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Image must be under 8MB.' }, { status: 413 });
    if (file.type && !file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Please upload an image (screenshot).' }, { status: 415 });
    }
    proofUrl = await uploadPaymentProof(file, (file as File).name || 'proof.jpg');
  }

  const res = await markAbandonedCartPaid(signupId, { proofUrl, paidBy: closer.name, method: 'closer' });
  return NextResponse.json(res, { status: res.ok ? 200 : 409 });
}
