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
    q2_pain?: string;
    q2_freetext?: string;
    q3_freetext?: string;
    q4_intent?: string;
  };
  const contactId = verifyContactToken(body.c);
  if (!contactId) {
    return NextResponse.json({ ok: false, error: 'Invalid or expired link.' });
  }
  if (!body.q1_industry || !body.q2_pain || !body.q4_intent) {
    return NextResponse.json({ ok: false, error: 'Please answer all the required questions.' });
  }
  const res = await saveSurveyResponse({
    contactId,
    q1Industry: body.q1_industry,
    q2Pain: body.q2_pain,
    q2Freetext: body.q2_freetext,
    q3Freetext: body.q3_freetext,
    q4Intent: body.q4_intent,
  });
  return NextResponse.json(res.ok ? { ok: true } : { ok: false, error: 'Could not save — please try again.' });
}
