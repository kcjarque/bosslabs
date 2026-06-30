/**
 * POST /api/admin/ndas — create a new NDA
 * GET  /api/admin/ndas — list NDAs (optional ?q=counterparty-name)
 *
 * Per-id update + delete live at /api/admin/ndas/[id].
 * Admin-cookie + same-origin gated.
 */
import { NextResponse } from 'next/server';
import { isAdminLoggedIn, isSameOrigin } from '@/lib/admin-auth';
import { createNda, listNdas } from '@/lib/ndas';

export const runtime = 'nodejs';

function unauth(req: Request): NextResponse | null {
  if (!isAdminLoggedIn()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

export async function GET(req: Request) {
  const fail = unauth(req);
  if (fail) return fail;
  const url = new URL(req.url);
  const q = url.searchParams.get('q') || undefined;
  const list = await listNdas({ q });
  return NextResponse.json({ ndas: list });
}

export async function POST(req: Request) {
  const fail = unauth(req);
  if (fail) return fail;
  const body = (await req.json().catch(() => null)) as
    | (Record<string, unknown> & { signupId?: string | null; status?: string; notes?: string })
    | null;
  if (!body || typeof body.counterpartyCompanyName !== 'string' || !body.counterpartyCompanyName.trim()) {
    return NextResponse.json({ error: 'counterpartyCompanyName is required' }, { status: 400 });
  }
  const created = await createNda(body as never);
  return NextResponse.json({ nda: created });
}
