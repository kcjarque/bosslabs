import { NextResponse } from 'next/server';
import { addSignup } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      name?: string;
      email?: string;
      message?: string;
    };
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
