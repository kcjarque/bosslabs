/**
 * Weekly Run Analysis — Prince's deep dive. Sunday 10am Manila (02:00 UTC,
 * vercel.json). Runs the FULL council session on Opus with 4-week memory +
 * self-grading, then sends the full analysis brief to Telegram. This is the
 * ONE routine moment changes are licensed; the daily path is a pulse only.
 */
import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/cron';
import { runCouncilPipeline } from '@/lib/council/pipeline';
import { sendTelegram } from '@/lib/telegram';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: Request) {
  const auth = verifyCronAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const result = await runCouncilPipeline('BOSS', { weekly: true });
    const sent = await sendTelegram(result.brief);
    return NextResponse.json({ ok: true, sessionId: result.sessionId, sent: sent.ok });
  } catch (err) {
    return NextResponse.json(
      { error: String(err instanceof Error ? err.message : err) },
      { status: 500 },
    );
  }
}
