import { NextResponse } from 'next/server';
import { isAdminLoggedIn } from '@/lib/admin-auth';
import { saveSettings, type Settings } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!isAdminLoggedIn()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await req.json()) as Partial<Settings>;
  const next = await saveSettings(body);
  return NextResponse.json({ ok: true, settings: next });
}
