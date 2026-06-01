import { NextResponse } from 'next/server';
import { isAdminLoggedIn, isSameOrigin } from '@/lib/admin-auth';
import {
  listCrmCards,
  addCrmCard,
  updateCrmCard,
  deleteCrmCard,
  getCrmTemplate,
  saveCrmTemplate,
  importPaidCustomers,
} from '@/lib/crm';
import { setSignupRemarks } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  if (!isAdminLoggedIn()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const [cards, template] = await Promise.all([listCrmCards(), getCrmTemplate()]);
  return NextResponse.json({ cards, template });
}

export async function POST(req: Request) {
  if (!isAdminLoggedIn()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    switch (body.action) {
      case 'add': {
        const card = await addCrmCard(body.card as { name: string });
        return NextResponse.json({ card });
      }
      case 'update':
        await updateCrmCard(String(body.id), body.patch as Record<string, never>);
        return NextResponse.json({ ok: true });
      case 'delete':
        await deleteCrmCard(String(body.id));
        return NextResponse.json({ ok: true });
      case 'template':
        await saveCrmTemplate(String(body.template ?? ''));
        return NextResponse.json({ ok: true });
      case 'import': {
        const added = await importPaidCustomers();
        return NextResponse.json({ added });
      }
      case 'remark': {
        // Writes to the linked signup so the remark also shows on the
        // customer profile (single source of truth).
        const signupId = String(body.signupId ?? '');
        if (!signupId) return NextResponse.json({ error: 'signupId required' }, { status: 400 });
        await setSignupRemarks(signupId, String(body.remarks ?? ''));
        return NextResponse.json({ ok: true });
      }
      default:
        return NextResponse.json({ error: 'unknown action' }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}
