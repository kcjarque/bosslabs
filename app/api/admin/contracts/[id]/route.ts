/**
 * GET    /api/admin/contracts/[id] — fetch one
 * PATCH  /api/admin/contracts/[id] — partial update
 * DELETE /api/admin/contracts/[id] — delete
 */
import { NextResponse } from 'next/server';
import { isAdminLoggedIn, isSameOrigin } from '@/lib/admin-auth';
import { deleteContract, getContract, updateContract } from '@/lib/contracts';

export const runtime = 'nodejs';

function unauth(req: Request): NextResponse | null {
  if (!isAdminLoggedIn()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

export async function GET(req: Request, ctx: { params: { id: string } }) {
  const fail = unauth(req);
  if (fail) return fail;
  const c = await getContract(ctx.params.id);
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ contract: c });
}

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const fail = unauth(req);
  if (fail) return fail;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  if (typeof body.downpaymentPercent === 'number') {
    body.downpaymentPercent = Math.min(99, Math.max(1, Math.round(body.downpaymentPercent)));
  }
  const updated = await updateContract(ctx.params.id, body as never);
  return NextResponse.json({ contract: updated });
}

export async function DELETE(req: Request, ctx: { params: { id: string } }) {
  const fail = unauth(req);
  if (fail) return fail;
  await deleteContract(ctx.params.id);
  return NextResponse.json({ ok: true });
}
