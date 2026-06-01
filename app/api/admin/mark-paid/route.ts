import { NextResponse } from 'next/server';
import { isAdminLoggedIn, isSameOrigin } from '@/lib/admin-auth';
import { markAbandonedCartPaid, uploadPaymentProof } from '@/lib/manual-payment';
import { revalidatePath } from 'next/cache';

export const runtime = 'nodejs';
const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(req: Request) {
  if (!isAdminLoggedIn()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const form = await req.formData();
  const signupId = String(form.get('signupId') ?? '');
  const file = form.get('file');
  if (!signupId) return NextResponse.json({ error: 'Missing signupId' }, { status: 400 });

  let proofUrl: string | null = null;
  if (file instanceof Blob && file.size > 0) {
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Image must be under 8MB.' }, { status: 413 });
    if (file.type && !file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Please upload an image (screenshot).' }, { status: 415 });
    }
    proofUrl = await uploadPaymentProof(file, (file as File).name || 'proof.jpg');
  }

  const res = await markAbandonedCartPaid(signupId, { proofUrl, paidBy: 'admin', method: 'admin' });
  if (res.ok) revalidatePath(`/admin/customers/${signupId}`);
  return NextResponse.json(res, { status: res.ok ? 200 : 409 });
}
