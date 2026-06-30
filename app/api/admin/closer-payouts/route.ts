/**
 * POST /api/admin/closer-payouts — create a payout for one closer
 *   body: { closerId: string, slipUrl?: string, slipFilename?: string, note?: string }
 * GET  /api/admin/closer-payouts — list payouts (admin Payout History tab)
 */
import { NextResponse } from 'next/server';
import { isAdminLoggedIn, isSameOrigin, getAdminSession } from '@/lib/admin-auth';
import { createCloserPayout, listPayouts } from '@/lib/closers';

export const runtime = 'nodejs';

function unauth(req: Request): NextResponse | null {
  if (!isAdminLoggedIn()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

export async function GET(req: Request) {
  const fail = unauth(req);
  if (fail) return fail;
  const payouts = await listPayouts();
  return NextResponse.json({ payouts });
}

export async function POST(req: Request) {
  const fail = unauth(req);
  if (fail) return fail;
  const body = (await req.json().catch(() => null)) as
    | { closerId?: string; slipUrl?: string; slipFilename?: string; note?: string }
    | null;
  if (!body?.closerId) {
    return NextResponse.json({ error: 'closerId is required' }, { status: 400 });
  }
  const session = getAdminSession();
  try {
    const payout = await createCloserPayout({
      closerId: body.closerId,
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
