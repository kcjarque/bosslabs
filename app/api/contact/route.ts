import { NextResponse } from 'next/server';
import { addSignup } from '@/lib/db';

export const runtime = 'nodejs';

// In-memory per-IP throttle (resets per warm lambda). Stops casual bot
// floods without standing up Redis. Real WAF lives in Vercel/Cloudflare.
const HITS = new Map<string, { count: number; firstAt: number }>();
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 5;

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = HITS.get(ip);
  if (!entry || now - entry.firstAt > WINDOW_MS) {
    HITS.set(ip, { count: 1, firstAt: now });
    return true;
  }
  entry.count += 1;
  return entry.count <= MAX_PER_WINDOW;
}

export async function POST(req: Request) {
  try {
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown';
    if (!rateLimit(ip)) {
      return NextResponse.json(
        { error: 'Too many requests. Try again in a minute.' },
        { status: 429 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      email?: string;
      message?: string;
      website?: string; // honeypot — must be empty
    };

    // Honeypot: bots autofill every field they see, including the hidden
    // "website" one. Real humans can't see it (display:none) so it's empty.
    if (body.website && body.website.trim()) {
      // Pretend success so the bot doesn't iterate. Don't write to DB.
      return NextResponse.json({ ok: true });
    }

    if (!body.name || !body.email || !body.message) {
      return NextResponse.json(
        { error: 'name, email and message required' },
        { status: 400 },
      );
    }
    const [firstName, ...rest] = body.name.trim().split(' ');
    await addSignup({
      firstName,
      lastName: rest.join(' ') || undefined,
      email: body.email.trim(),
      phone: '',
      source: 'contact',
      message: body.message.trim(),
    });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
