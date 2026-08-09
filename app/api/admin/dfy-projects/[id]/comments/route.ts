/**
 * GET  /api/admin/dfy-projects/[id]/comments
 * POST /api/admin/dfy-projects/[id]/comments  { body: string }
 */
import { NextResponse } from 'next/server';
import { isAdminLoggedIn, isSameOrigin, getAdminSession } from '@/lib/admin-auth';
import { addComment, listComments } from '@/lib/dfy';

export const runtime = 'nodejs';

async function unauth(req: Request): Promise<NextResponse | null> {
  if (!(await isAdminLoggedIn())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const fail = await unauth(req);
  if (fail) return fail;
  const comments = await listComments((await ctx.params).id);
  return NextResponse.json({ comments });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const fail = await unauth(req);
  if (fail) return fail;
  const body = (await req.json().catch(() => null)) as { body?: string } | null;
  if (!body || typeof body.body !== 'string' || !body.body.trim()) {
    return NextResponse.json({ error: 'body required' }, { status: 400 });
  }
  const session = await getAdminSession();
  const author = session?.name || 'admin';
  const comment = await addComment((await ctx.params).id, author, body.body.trim());
  return NextResponse.json({ comment });
}
