import { NextResponse } from 'next/server';
import { sendTelegram } from '@/lib/telegram';

export const runtime = 'nodejs';

export async function POST() {
  const result = await sendTelegram(
    '🔔 <b>BOSSLABS AI</b> — Telegram test\n\nIf you see this, notifications are working.',
  );
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.reason ?? 'Send failed' },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
}
