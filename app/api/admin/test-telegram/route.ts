import { NextResponse } from 'next/server';
import { sendTelegram } from '@/lib/telegram';
import { isAdminLoggedIn } from '@/lib/admin-auth';

export const runtime = 'nodejs';

export async function POST() {
  // Admin-only — without this, anyone could spam the owner's Telegram.
  if (!isAdminLoggedIn()) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
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
