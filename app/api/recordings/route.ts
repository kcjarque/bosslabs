import { NextResponse } from 'next/server';
import { getSettings, saveRecording } from '@/lib/db';

export const runtime = 'nodejs';
export const maxDuration = 15;

const MAX_EVENTS = 50_000;
const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5 MB

export async function GET() {
  const settings = await getSettings();
  return NextResponse.json({ enabled: settings.recordingEnabled });
}

export async function POST(req: Request) {
  const settings = await getSettings();
  if (!settings.recordingEnabled) {
    return NextResponse.json({ error: 'recording disabled' }, { status: 403 });
  }

  const contentLength = Number(req.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'payload too large' }, { status: 413 });
  }

  let body: { sessionId?: string; page?: string; events?: unknown[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const { sessionId, page, events } = body;
  if (!sessionId || !page || !Array.isArray(events) || events.length === 0) {
    return NextResponse.json({ error: 'missing sessionId, page, or events' }, { status: 400 });
  }

  if (events.length > MAX_EVENTS) {
    return NextResponse.json({ error: 'too many events' }, { status: 413 });
  }

  const id = await saveRecording({ sessionId, page, events });
  return NextResponse.json({ ok: true, id });
}
