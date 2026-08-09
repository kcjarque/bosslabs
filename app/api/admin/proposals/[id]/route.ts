/**
 * GET    /api/admin/proposals/[id] — fetch one
 * PATCH  /api/admin/proposals/[id] — partial update
 * DELETE /api/admin/proposals/[id] — delete
 */
import { NextResponse } from 'next/server';
import { isAdminLoggedIn, isSameOrigin } from '@/lib/admin-auth';
import { deleteProposal, getProposal, updateProposal } from '@/lib/proposals';

export const runtime = 'nodejs';

async function unauth(req: Request): Promise<NextResponse | null> {
  if (!(await isAdminLoggedIn())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const fail = await unauth(req);
  if (fail) return fail;
  const p = await getProposal((await ctx.params).id);
  if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ proposal: p });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const fail = await unauth(req);
  if (fail) return fail;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  const updated = await updateProposal((await ctx.params).id, body as never);
  return NextResponse.json({ proposal: updated });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const fail = await unauth(req);
  if (fail) return fail;
  await deleteProposal((await ctx.params).id);
  return NextResponse.json({ ok: true });
}
