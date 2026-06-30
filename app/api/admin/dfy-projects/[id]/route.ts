/**
 * GET    /api/admin/dfy-projects/[id] — single project (drawer hydration)
 * PATCH  /api/admin/dfy-projects/[id] — partial update: lane move, vision edits,
 *                                      link edits, build-step toggle, etc.
 * DELETE /api/admin/dfy-projects/[id] — hard delete
 */
import { NextResponse } from 'next/server';
import { isAdminLoggedIn, isSameOrigin, getAdminSession } from '@/lib/admin-auth';
import { deleteProject, getProject, updateProject, type DfyBuildStep } from '@/lib/dfy';

export const runtime = 'nodejs';

function unauth(req: Request): NextResponse | null {
  if (!isAdminLoggedIn()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

export async function GET(req: Request, ctx: { params: { id: string } }) {
  const fail = unauth(req);
  if (fail) return fail;
  const p = await getProject(ctx.params.id);
  if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ project: p });
}

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const fail = unauth(req);
  if (fail) return fail;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  // Special path: toggle a single build step. Body shape:
  //   { toggleStep: 'lite_shipped', checked: true }
  // We re-fetch + mutate the array so concurrent edits don't clobber siblings.
  if (typeof body.toggleStep === 'string') {
    const project = await getProject(ctx.params.id);
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const session = getAdminSession();
    const author = session?.name || 'admin';
    const slug = body.toggleStep;
    const checked = body.checked !== false; // default true
    const steps: DfyBuildStep[] = project.buildSteps.map((s) =>
      s.slug === slug
        ? { ...s, checkedAt: checked ? new Date().toISOString() : null, checkedBy: checked ? author : null }
        : s,
    );
    const updated = await updateProject(ctx.params.id, { buildSteps: steps });
    return NextResponse.json({ project: updated });
  }

  const updated = await updateProject(ctx.params.id, body as never);
  return NextResponse.json({ project: updated });
}

export async function DELETE(req: Request, ctx: { params: { id: string } }) {
  const fail = unauth(req);
  if (fail) return fail;
  await deleteProject(ctx.params.id);
  return NextResponse.json({ ok: true });
}
