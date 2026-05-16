import { NextResponse } from 'next/server';
import { verifyWebhook } from '@/lib/xendit';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const token = req.headers.get('x-callback-token');
  if (!verifyWebhook(token)) {
    return NextResponse.json({ error: 'invalid token' }, { status: 401 });
  }

  const event = (await req.json()) as {
    id?: string;
    external_id?: string;
    status?: 'PAID' | 'EXPIRED' | 'PENDING' | 'FAILED';
    amount?: number;
  };

  // TODO: persist + idempotency-check. On status === 'PAID':
  //   - mark order paid in Supabase
  //   - call Zoom REST API to register the payer for the webinar
  //   - enqueue welcome email with Zoom join link + Free Tools
  console.log('[xendit-webhook]', event);

  return NextResponse.json({ ok: true });
}
