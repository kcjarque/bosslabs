/**
 * GET  /api/admin/dfy-projects/[id]/files
 * POST /api/admin/dfy-projects/[id]/files — multipart upload OR JSON { externalUrl, name, kind }
 *   - When multipart: file field, plus optional `kind` (defaults to 'other')
 *   - When JSON: external URL link (no upload to bucket)
 */
import { NextResponse } from 'next/server';
import { isAdminLoggedIn, isSameOrigin, getAdminSession } from '@/lib/admin-auth';
import { isSupabaseConfigured } from '@/lib/supabase';
import { listFiles, registerFile, uploadFileToBucket, type DfyFile } from '@/lib/dfy';

export const runtime = 'nodejs';

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB — design refs + PDFs run bigger than receipts

function unauth(req: Request): NextResponse | null {
  if (!isAdminLoggedIn()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

function asKind(k: unknown): DfyFile['kind'] {
  return k === 'contract' || k === 'vision' || k === 'design' ? k : 'other';
}

export async function GET(req: Request, ctx: { params: { id: string } }) {
  const fail = unauth(req);
  if (fail) return fail;
  const files = await listFiles(ctx.params.id);
  return NextResponse.json({ files });
}

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const fail = unauth(req);
  if (fail) return fail;
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Storage is not configured.' }, { status: 500 });
  }
  const session = getAdminSession();
  const uploadedBy = session?.name || 'admin';
  const projectId = ctx.params.id;

  const ct = req.headers.get('content-type') || '';

  if (ct.includes('application/json')) {
    const body = (await req.json().catch(() => null)) as
      | { externalUrl?: string; name?: string; kind?: string }
      | null;
    if (!body?.externalUrl || !body?.name) {
      return NextResponse.json({ error: 'externalUrl and name required' }, { status: 400 });
    }
    const file = await registerFile({
      projectId,
      name: body.name,
      kind: asKind(body.kind),
      externalUrl: body.externalUrl,
      uploadedBy,
    });
    return NextResponse.json({ file });
  }

  // Multipart upload path
  const form = await req.formData();
  const blob = form.get('file');
  const kind = asKind(form.get('kind'));
  if (!(blob instanceof Blob)) {
    return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });
  }
  if (blob.size > MAX_BYTES) {
    return NextResponse.json({ error: `File must be under ${MAX_BYTES / 1024 / 1024} MB.` }, { status: 413 });
  }
  const rawName = (blob as File).name || 'upload';
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const { storagePath, size } = await uploadFileToBucket(
    projectId,
    rawName,
    bytes,
    blob.type || 'application/octet-stream',
  );
  const file = await registerFile({
    projectId,
    name: rawName,
    kind,
    storagePath,
    mime: blob.type || null,
    sizeBytes: size,
    uploadedBy,
  });
  return NextResponse.json({ file });
}
