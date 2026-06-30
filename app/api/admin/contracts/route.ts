/**
 * POST /api/admin/contracts — create a new contract
 * GET  /api/admin/contracts — list contracts (optional ?q=client-name)
 *
 * Per-id update + delete live at /api/admin/contracts/[id].
 *
 * Admin-cookie + same-origin gated. Body shape mirrors ContractFormData
 * plus optional { signupId, status, notes }.
 */
import { NextResponse } from 'next/server';
import { isAdminLoggedIn, isSameOrigin } from '@/lib/admin-auth';
import { createContract, listContracts } from '@/lib/contracts';

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
  const list = await listContracts({ q });
  return NextResponse.json({ contracts: list });
}

export async function POST(req: Request) {
  const fail = unauth(req);
  if (fail) return fail;
  const body = (await req.json().catch(() => null)) as
    | (Record<string, unknown> & { signupId?: string | null; status?: string; notes?: string })
    | null;
  if (!body || typeof body.clientCompanyName !== 'string' || !body.clientCompanyName.trim()) {
    return NextResponse.json({ error: 'clientCompanyName is required' }, { status: 400 });
  }
  // Trust the typed shape — admin-only endpoint, no field-by-field validation.
  // Defensive: clamp downpaymentPercent into the allowed range so the DB
  // check constraint can't reject an otherwise-good save.
  if (typeof body.downpaymentPercent === 'number') {
    body.downpaymentPercent = Math.min(99, Math.max(1, Math.round(body.downpaymentPercent)));
  }
  const created = await createContract(body as never);
  return NextResponse.json({ contract: created });
}
