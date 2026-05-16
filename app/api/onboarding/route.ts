import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // TODO: persist to Supabase + register payer in Zoom Webinar + push to email tool.
    // For now we log so the form is fully testable end-to-end in dev.
    console.log('[onboarding] submission:', body);

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
