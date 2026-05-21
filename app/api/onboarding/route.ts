import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    // Log only the field-name surface, not the values — every value is
    // potentially PII and Vercel function logs are searchable + retained.
    console.log('[onboarding] submission keys:', Object.keys(body));

    // TODO: persist to Supabase + register payer in Zoom Webinar + push to email tool.

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
