/**
 * GET    /api/admin/ndas/[id] — fetch one
 * PATCH  /api/admin/ndas/[id] — partial update
 * DELETE /api/admin/ndas/[id] — delete
 */
import { NextResponse } from 'next/server';
import { isAdminLoggedIn, isSameOrigin } from '@/lib/admin-auth';
import { deleteNda, getNda, updateNda } from '@/lib/ndas';

export const runtime = 'nodejs';

function unauth(req: Request): NextResponse | null {
  if (!isAdminLoggedIn()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

export async function GET(req: Request, ctx: { params: { id: string } }) {
  const fail = unauth(req);
  if (fail) return fail;
  const n = await getNda(ctx.params.id);
  if (!n) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ nda: n });
}

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const fail = unauth(req);
  if (fail) return fail;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  const updated = await updateNda(ctx.params.id, body as never);
  return NextResponse.json({ nda: updated });
}

export async function DELETE(req: Request, ctx: { params: { id: string } }) {
  const fail = unauth(req);
  if (fail) return fail;
  await deleteNda(ctx.params.id);
  return NextResponse.json({ ok: true });
}
