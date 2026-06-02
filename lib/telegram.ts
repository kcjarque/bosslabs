/**
 * Telegram Bot API — lightweight helper for sending notifications.
 *
 * Reads bot token + chat ID from the settings table. If either is missing
 * the send is a silent no-op (best-effort — never blocks the main flow).
 */

import { getSettings, saveSettings } from './db';

const BASE = 'https://api.telegram.org/bot';

type TgResponse =
  | { ok: true; result: { message_id: number } }
  | {
      ok: false;
      description: string;
      // Telegram returns this when a basic group is upgraded to a supergroup:
      // the old chat_id is dead and the new one lives here. We auto-heal on it.
      parameters?: { migrate_to_chat_id?: number };
    };

/**
 * POST a Telegram message, auto-healing the saved chat_id when a group is
 * upgraded to a supergroup (the chat_id changes; the old one starts failing).
 * On that specific error Telegram hands back the new id — we persist it and
 * retry once so a migration never silently drops notifications again.
 */
async function sendWithMigrationRetry(
  token: string,
  chatId: string,
  text: string,
): Promise<{ ok: boolean; reason?: string }> {
  const post = (cid: string) =>
    fetch(`${BASE}${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: cid,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    }).then((r) => r.json() as Promise<TgResponse>);

  let json = await post(chatId);
  if (!json.ok && json.parameters?.migrate_to_chat_id) {
    const newId = String(json.parameters.migrate_to_chat_id);
    console.warn(`[telegram] group upgraded to supergroup ${newId} — updating chat_id + retrying`);
    await saveSettings({ telegramChatId: newId }).catch(() => {});
    json = await post(newId);
  }
  if (!json.ok) {
    console.warn('[telegram] sendMessage failed:', json.description);
    return { ok: false, reason: json.description };
  }
  return { ok: true };
}

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

    return await sendWithMigrationRetry(token, chatId, text);
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

    const post = (cid: string) => {
      const form = new FormData();
      form.append('chat_id', cid);
      form.append('caption', caption);
      form.append('parse_mode', 'HTML');
      form.append('photo', new Blob([bytes]), filename);
      return fetch(`${BASE}${token}/sendPhoto`, { method: 'POST', body: form }).then(
        (r) => r.json() as Promise<TgResponse>,
      );
    };

    let json = await post(chatId);
    if (!json.ok && json.parameters?.migrate_to_chat_id) {
      const newId = String(json.parameters.migrate_to_chat_id);
      console.warn(`[telegram] group upgraded to supergroup ${newId} — updating chat_id + retrying (photo)`);
      await saveSettings({ telegramChatId: newId }).catch(() => {});
      json = await post(newId);
    }
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

/**
 * Send a Telegram message to a SPECIFIC chat id (e.g. an affiliate's own
 * chat), using the configured bot token. Never throws.
 */
export async function sendTelegramTo(
  chatId: string,
  text: string,
): Promise<{ ok: boolean; reason?: string }> {
  try {
    if (!chatId) return { ok: false, reason: 'no chat id' };
    const settings = await getSettings();
    const token = settings.telegramBotToken;
    if (!token) return { ok: false, reason: 'telegram not configured' };
    const res = await fetch(`${BASE}${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
    const json = (await res.json()) as TgResponse;
    if (!json.ok) return { ok: false, reason: json.description };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'error' };
  }
}

/** Escape HTML special chars for Telegram HTML parse mode. */
export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
