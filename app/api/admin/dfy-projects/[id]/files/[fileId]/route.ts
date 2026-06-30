/**
 * DELETE /api/admin/dfy-projects/[id]/files/[fileId] — remove a file (also
 *   nukes the bucket object when storage-backed).
 */
import { NextResponse } from 'next/server';
import { isAdminLoggedIn, isSameOrigin } from '@/lib/admin-auth';
import { deleteFile } from '@/lib/dfy';

export const runtime = 'nodejs';

export async function DELETE(req: Request, ctx: { params: { id: string; fileId: string } }) {
  if (!isAdminLoggedIn()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  await deleteFile(ctx.params.fileId);
  return NextResponse.json({ ok: true });
}
