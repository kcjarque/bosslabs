/**
 * Telegram Bot API — lightweight helper for sending notifications.
 *
 * Reads bot token + chat ID from the settings table. If either is missing
 * the send is a silent no-op (best-effort — never blocks the main flow).
 */

import { getSettings } from './db';

const BASE = 'https://api.telegram.org/bot';

type TgResponse =
  | { ok: true; result: { message_id: number } }
  | { ok: false; description: string };

/**
 * Send a Telegram message to the configured group chat.
 *
 * Returns `{ ok: true }` on success or `{ ok: false, reason }` on skip/error.
 * Never throws — callers can fire-and-forget with `void sendTelegram(...)`.
 */
export async function sendTelegram(
  text: string,
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const settings = await getSettings();
    const token = settings.telegramBotToken;
    const chatId = settings.telegramChatId;

    if (!token || !chatId) {
      return { ok: false, reason: 'telegram not configured' };
    }

    const res = await fetch(`${BASE}${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    const json = (await res.json()) as TgResponse;
    if (!json.ok) {
      console.warn('[telegram] sendMessage failed:', json.description);
      return { ok: false, reason: json.description };
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error';
    console.warn('[telegram] sendMessage error:', msg);
    return { ok: false, reason: msg };
  }
}

/**
 * Send a photo (e.g. a payment-proof screenshot) to the configured chat.
 * Forwards the raw bytes via multipart. Never throws.
 */
export async function sendTelegramPhoto(
  bytes: ArrayBuffer,
  filename: string,
  caption: string,
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const settings = await getSettings();
    const token = settings.telegramBotToken;
    const chatId = settings.telegramChatId;
    if (!token || !chatId) return { ok: false, reason: 'telegram not configured' };

    const form = new FormData();
    form.append('chat_id', chatId);
    form.append('caption', caption);
    form.append('parse_mode', 'HTML');
    form.append('photo', new Blob([bytes]), filename);

    const res = await fetch(`${BASE}${token}/sendPhoto`, { method: 'POST', body: form });
    const json = (await res.json()) as TgResponse;
    if (!json.ok) {
      console.warn('[telegram] sendPhoto failed:', json.description);
      return { ok: false, reason: json.description };
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error';
    console.warn('[telegram] sendPhoto error:', msg);
    return { ok: false, reason: msg };
  }
}

/** Escape HTML special chars for Telegram HTML parse mode. */
export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
