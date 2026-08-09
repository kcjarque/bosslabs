/**
 * POST /api/admin/proposals — create a new proposal
 * GET  /api/admin/proposals — list proposals (optional ?q=client-name)
 *
 * Per-id update + delete live at /api/admin/proposals/[id].
 *
 * Admin-cookie + same-origin gated. Body shape mirrors ProposalFormData plus
 * optional { signupId, status, notes }.
 */
import { NextResponse } from 'next/server';
import { isAdminLoggedIn, isSameOrigin } from '@/lib/admin-auth';
import { createProposal, listProposals } from '@/lib/proposals';

export const runtime = 'nodejs';

async function unauth(req: Request): Promise<NextResponse | null> {
  if (!(await isAdminLoggedIn())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

export async function GET(req: Request) {
  const fail = await unauth(req);
  if (fail) return fail;
  const url = new URL(req.url);
  const q = url.searchParams.get('q') || undefined;
  const list = await listProposals({ q });
  return NextResponse.json({ proposals: list });
}

export async function POST(req: Request) {
  const fail = await unauth(req);
  if (fail) return fail;
  const body = (await req.json().catch(() => null)) as
    | (Record<string, unknown> & { signupId?: string | null; status?: string; notes?: string })
    | null;
  if (!body || typeof body.clientCompanyName !== 'string' || !body.clientCompanyName.trim()) {
    return NextResponse.json({ error: 'clientCompanyName is required' }, { status: 400 });
  }
  // Trust the typed shape — admin-only endpoint, no field-by-field validation.
  const created = await createProposal(body as never);
  return NextResponse.json({ proposal: created });
}
