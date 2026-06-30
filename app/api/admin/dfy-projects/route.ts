/**
 * POST /api/admin/dfy-projects — create
 * GET  /api/admin/dfy-projects — list (kanban hydration)
 */
import { NextResponse } from 'next/server';
import { isAdminLoggedIn, isSameOrigin } from '@/lib/admin-auth';
import { createProject, listProjects } from '@/lib/dfy';

export const runtime = 'nodejs';

function unauth(req: Request): NextResponse | null {
  if (!isAdminLoggedIn()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

export async function GET(req: Request) {
  const fail = unauth(req);
  if (fail) return fail;
  const projects = await listProjects();
  return NextResponse.json({ projects });
}

export async function POST(req: Request) {
  const fail = unauth(req);
  if (fail) return fail;
  const body = (await req.json().catch(() => null)) as
    | { customerName?: string; signupId?: string | null; projectName?: string }
    | null;
  if (!body || typeof body.customerName !== 'string' || !body.customerName.trim()) {
    return NextResponse.json({ error: 'customerName is required' }, { status: 400 });
  }
  const project = await createProject({
    customerName: body.customerName.trim(),
    signupId: body.signupId ?? null,
    projectName: body.projectName?.trim() || '',
  });
  return NextResponse.json({ project });
}
