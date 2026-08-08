/**
 * Telegram webhook — powers the `/prince <question>` conversational agent.
 *
 * Security: verifies Telegram's secret-token header, and only answers from the
 * authorized chat(s) (the settings chat + optional TELEGRAM_PRINCE_CHAT_ID) so
 * randoms can't burn tokens. Dedups on update_id (Telegram retries slow acks).
 * Runs the analysis synchronously and returns 200 at the end — comfortably
 * under Telegram's ~60s retry window (a Prince answer is ~15–25s).
 */
import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { getSettings } from '@/lib/db';
import { sendTelegramPlain } from '@/lib/telegram';
import { askPrince } from '@/lib/council/prince';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  // 1. Verify it's really Telegram (secret set at setWebhook time).
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers.get('x-telegram-bot-api-secret-token') !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update: Record<string, unknown>;
  try { update = (await req.json()) as Record<string, unknown>; } catch { return NextResponse.json({ ok: true }); }
  const msg = (update.message ?? update.edited_message) as
    | { text?: string; chat?: { id?: number | string } }
    | undefined;
  const text = (msg?.text ?? '').trim();
  const chatId = String(msg?.chat?.id ?? '');
  const updateId = update.update_id as number | undefined;

  // 2. Only handle /prince.
  if (!/^\/prince\b/i.test(text)) return NextResponse.json({ ok: true });

  // 3. Lock to the authorized chat(s).
  const settings = await getSettings().catch(() => ({ telegramChatId: '' }) as { telegramChatId: string });
  const allowed = new Set([settings.telegramChatId, process.env.TELEGRAM_PRINCE_CHAT_ID].filter(Boolean) as string[]);
  if (allowed.size > 0 && !allowed.has(chatId)) return NextResponse.json({ ok: true });

  // 4. Dedup on update_id — the PK conflict means Telegram already delivered
  //    this once; skip so a retry never double-answers.
  const question = text.replace(/^\/prince(@\w+)?/i, '').trim();
  if (typeof updateId === 'number') {
    const { error } = await getSupabase()
      .from('prince_queries')
      .insert({ update_id: updateId, chat_id: chatId, question });
    if (error) return NextResponse.json({ ok: true });
  }

  // 5. Ack, answer, reply.
  if (!question) {
    await sendTelegramPlain(chatId, '🤴 Ask me anything about the ads — e.g.\n/prince why is CPP up this week?');
    return NextResponse.json({ ok: true });
  }
  await sendTelegramPlain(chatId, '🤴 On it — pulling the latest numbers…');
  const answer = await askPrince(question);
  await sendTelegramPlain(chatId, `🤴 Prince\n\n${answer}`);
  return NextResponse.json({ ok: true });
}
