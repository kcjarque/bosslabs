import { NextResponse } from 'next/server';
import { getCloserSession } from '@/lib/closer-auth';
import { getSettings } from '@/lib/db';
import {
  listUnclaimedAbandoned,
  listCloserLeads,
  releaseExpiredClaims,
  claimLead,
  releaseLead,
  setLeadStage,
  setLeadRemark,
} from '@/lib/closers';

export const runtime = 'nodejs';

export async function GET() {
  const closer = await getCloserSession();
  if (!closer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const settings = await getSettings();
  const holdHours = settings.closerClaimHoldHours || 6;
  const work = { startHour: settings.closerWorkStartHour ?? 9, endHour: settings.closerWorkEndHour ?? 20 };
  // Free up any claims past the WORKING-HOUR window BEFORE reading the board.
  await releaseExpiredClaims(holdHours, work);
  const [pool, leads] = await Promise.all([
    listUnclaimedAbandoned(),
    listCloserLeads(closer.id, holdHours, work),
  ]);
  return NextResponse.json({ pool, leads, holdHours, workStart: work.startHour, workEnd: work.endHour });
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
      case 'remark': {
        const res = await setLeadRemark(String(body.signupId), closer.id, String(body.remarks ?? ''));
        return NextResponse.json(res, { status: res.ok ? 200 : 403 });
      }
      default:
        return NextResponse.json({ error: 'unknown action' }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}
