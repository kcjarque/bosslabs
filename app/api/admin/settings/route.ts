import { NextResponse } from 'next/server';
import { isAdminLoggedIn, isSameOrigin } from '@/lib/admin-auth';
import { getSettingsForAdmin, saveSettings, type Settings } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!isAdminLoggedIn()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  let body: Partial<Settings>;
  try {
    body = (await req.json()) as Partial<Settings>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  // Validate URL-shaped fields rather than trusting whatever lands here.
  const urlFields: (keyof Settings)[] = [
    'zoomRegisterUrl',
    'zoomJoinUrl',
    'replayUrl',
    'messengerGroupUrl',
  ];
  for (const f of urlFields) {
    const v = body[f];
    if (typeof v === 'string' && v && !/^https?:\/\//.test(v)) {
      return NextResponse.json(
        { error: `${f} must start with http:// or https://` },
        { status: 400 },
      );
    }
  }
  await saveSettings(body);
  // Return the masked version so secrets don't bounce back through the wire.
  const next = await getSettingsForAdmin();
  return NextResponse.json({ ok: true, settings: next });
}
