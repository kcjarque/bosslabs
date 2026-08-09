/**
 * POST /api/admin/reimbursement-payouts — create a payout for one staff member
 *   body: { staffId: string, slipUrl?: string, slipFilename?: string, note?: string }
 * GET  /api/admin/reimbursement-payouts — list payouts (Payout History tab)
 *
 * Admin-only (not staff, even a staff account that knows the URL) — paying
 * out reimbursements is an approval action, unlike submitting your own claim.
 */
import { NextResponse } from 'next/server';
import { isSameOrigin, getAdminSession } from '@/lib/admin-auth';
import { createReimbursementPayout, listReimbursementPayouts } from '@/lib/reimbursements';

export const runtime = 'nodejs';

async function requireRealAdmin(req: Request): Promise<NextResponse | null> {
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const session = await getAdminSession();
  if (!session || session.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return null;
}

export async function GET(req: Request) {
  const fail = await requireRealAdmin(req);
  if (fail) return fail;
  const payouts = await listReimbursementPayouts();
  return NextResponse.json({ payouts });
}

export async function POST(req: Request) {
  const fail = await requireRealAdmin(req);
  if (fail) return fail;
  const body = (await req.json().catch(() => null)) as
    | { staffId?: string; slipUrl?: string; slipFilename?: string; note?: string }
    | null;
  if (!body?.staffId) {
    return NextResponse.json({ error: 'staffId is required' }, { status: 400 });
  }
  const session = await getAdminSession();
  try {
    const payout = await createReimbursementPayout({
      staffId: body.staffId,
      slipUrl: body.slipUrl ?? null,
      slipFilename: body.slipFilename ?? null,
      note: body.note ?? null,
      createdBy: session?.name || 'admin',
    });
    return NextResponse.json({ payout });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Payout failed' },
      { status: 400 },
    );
  }
}
