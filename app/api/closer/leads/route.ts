import { NextResponse } from 'next/server';
import { getCloserSession } from '@/lib/closer-auth';
import {
  listUnclaimedAbandoned,
  listCloserLeads,
  claimLead,
  releaseLead,
  setLeadStage,
} from '@/lib/closers';

export const runtime = 'nodejs';

export async function GET() {
  const closer = await getCloserSession();
  if (!closer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const [pool, leads] = await Promise.all([listUnclaimedAbandoned(), listCloserLeads(closer.id)]);
  return NextResponse.json({ pool, leads });
}

export async function POST(req: Request) {
  const closer = await getCloserSession();
  if (!closer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    switch (body.action) {
      case 'claim': {
        const res = await claimLead(String(body.signupId), closer.id);
        return NextResponse.json(res, { status: res.ok ? 200 : 409 });
      }
      case 'release':
        await releaseLead(String(body.leadId), closer.id);
        return NextResponse.json({ ok: true });
      case 'stage':
        await setLeadStage(String(body.leadId), closer.id, String(body.stage));
        return NextResponse.json({ ok: true });
      default:
        return NextResponse.json({ error: 'unknown action' }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}
