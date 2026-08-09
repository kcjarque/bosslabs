/**
 * POST /api/survey — accepts a survey submission from /survey. The contact is
 * identified by the signed `c` token (no login), so a stranger can't write a
 * survey for someone else. Same-origin only.
 */
import { NextResponse } from 'next/server';
import { verifyContactToken, isSameOrigin } from '@/lib/admin-auth';
import { saveSurveyResponse } from '@/lib/survey';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    c?: string;
    q1_industry?: string;
    q1_freetext?: string;
    q2_pain?: string;
    q2_freetext?: string;
    q3_team?: string;
    q4_tried?: string;
    q5_freetext?: string;
    q6_intent?: string;
  };
  const contactId = verifyContactToken(body.c);
  if (!contactId) {
    return NextResponse.json({ ok: false, error: 'Invalid or expired link.' });
  }
  if (!body.q1_industry || !body.q2_pain || !body.q3_team || !body.q4_tried || !body.q6_intent) {
    return NextResponse.json({ ok: false, error: 'Please answer all the required questions.' });
  }
  const res = await saveSurveyResponse({
    contactId,
    q1Industry: body.q1_industry,
    q1Freetext: body.q1_freetext,
    q2Pain: body.q2_pain,
    q2Freetext: body.q2_freetext,
    teamSize: body.q3_team,
    triedBefore: body.q4_tried,
    firstProcess: body.q5_freetext,
    intent: body.q6_intent,
  });
  return NextResponse.json(res.ok ? { ok: true } : { ok: false, error: 'Could not save — please try again.' });
}
