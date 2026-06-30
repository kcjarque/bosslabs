/**
 * GET    /api/admin/closer-payouts/[id] — list commissions in one payout
 *                                         (history-row expand)
 * DELETE /api/admin/closer-payouts/[id] — void: reverts commissions to pending
 *                                         and marks the payout 'voided' (kept
 *                                         for audit; not hard-deleted)
 */
import { NextResponse } from 'next/server';
import { isAdminLoggedIn, isSameOrigin } from '@/lib/admin-auth';
import { listCommissionsByPayout, voidCloserPayout } from '@/lib/closers';

export const runtime = 'nodejs';

export async function GET(req: Request, ctx: { params: { id: string } }) {
  if (!isAdminLoggedIn()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const commissions = await listCommissionsByPayout(ctx.params.id);
  return NextResponse.json({ commissions });
}

export async function DELETE(req: Request, ctx: { params: { id: string } }) {
  if (!isAdminLoggedIn()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  await voidCloserPayout(ctx.params.id);
  return NextResponse.json({ ok: true });
}
