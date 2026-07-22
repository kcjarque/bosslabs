/**
 * GET    /api/admin/reimbursement-payouts/[id] — list requests in one payout
 *                                                (history-row expand)
 * DELETE /api/admin/reimbursement-payouts/[id] — void: reverts requests to
 *                                                pending, marks payout 'voided'
 * Admin-only, same as the collection route.
 */
import { NextResponse } from 'next/server';
import { isSameOrigin, getAdminSession } from '@/lib/admin-auth';
import { listRequestsByPayout, voidReimbursementPayout } from '@/lib/reimbursements';

export const runtime = 'nodejs';

function requireRealAdmin(req: Request): NextResponse | null {
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const session = getAdminSession();
  if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return null;
}

export async function GET(req: Request, ctx: { params: { id: string } }) {
  const fail = requireRealAdmin(req);
  if (fail) return fail;
  const requests = await listRequestsByPayout(ctx.params.id);
  return NextResponse.json({ requests });
}

export async function DELETE(req: Request, ctx: { params: { id: string } }) {
  const fail = requireRealAdmin(req);
  if (fail) return fail;
  await voidReimbursementPayout(ctx.params.id);
  return NextResponse.json({ ok: true });
}
