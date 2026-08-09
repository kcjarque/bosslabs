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

/** Telegram hard-caps a single message at 4096 chars. Split longer text on
 *  blank-line (\n\n) block boundaries so each chunk stays valid HTML — our
 *  briefs balance every <b>/<i> tag WITHIN a block, so a block-boundary split
 *  never orphans a tag. A block that alone exceeds the limit falls back to a
 *  line-boundary split (each rendered line is also tag-balanced), then a raw
 *  char cut as a last resort. Uses 3900 for headroom under 4096. */
export function splitForTelegram(text: string, limit = 3900): string[] {
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  let cur = '';
  const flush = () => { if (cur) { chunks.push(cur); cur = ''; } };
  const addLarge = (block: string) => {
    let rest = block;
    while (rest.length > limit) {
      let cut = rest.lastIndexOf('\n', limit);
      if (cut <= 0) cut = limit;
      chunks.push(rest.slice(0, cut));
      rest = rest.slice(cut).replace(/^\n+/, '');
    }
    cur = rest;
  };
  for (const block of text.split('\n\n')) {
    const piece = cur ? `${cur}\n\n${block}` : block;
    if (piece.length <= limit) { cur = piece; continue; }
    flush();
    if (block.length <= limit) { cur = block; } else { addLarge(block); }
  }
  flush();
  return chunks;
}

/**
 * Send a Telegram message to the configured group chat. Messages over
 * Telegram's 4096-char cap are split into ordered chunks (see splitForTelegram)
 * — the v2 weekly brief regularly exceeds it. Short messages are a single send,
 * unchanged.
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

    const chunks = splitForTelegram(text);
    for (let i = 0; i < chunks.length; i++) {
      const res = await sendWithMigrationRetry(token, chatId, chunks[i]);
      if (!res.ok) return { ok: false, reason: `chunk ${i + 1}/${chunks.length}: ${res.reason}` };
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error';
    console.warn('[telegram] sendMessage error:', msg);
    return { ok: false, reason: msg };
  }
}

/** Shared multipart POST for sendPhoto — used by both the main-chat sender
 *  (which auto-heals on supergroup migration) and the arbitrary-chat sender
 *  (which doesn't, since migration only applies to the settings-tracked chat). */
function postPhoto(
  token: string,
  cid: string,
  bytes: ArrayBuffer,
  filename: string,
  caption: string,
): Promise<TgResponse> {
  const form = new FormData();
  form.append('chat_id', cid);
  form.append('caption', caption);
  form.append('parse_mode', 'HTML');
  form.append('photo', new Blob([bytes]), filename);
  return fetch(`${BASE}${token}/sendPhoto`, { method: 'POST', body: form }).then(
    (r) => r.json() as Promise<TgResponse>,
  );
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

    let json = await postPhoto(token, chatId, bytes, filename, caption);
    if (!json.ok && json.parameters?.migrate_to_chat_id) {
      const newId = String(json.parameters.migrate_to_chat_id);
      console.warn(`[telegram] group upgraded to supergroup ${newId} — updating chat_id + retrying (photo)`);
      await saveSettings({ telegramChatId: newId }).catch(() => {});
      json = await postPhoto(token, newId, bytes, filename, caption);
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
 * Send a photo to a SPECIFIC chat id (e.g. the sales-team chat), using the
 * configured bot token. No migration auto-heal — that only applies to the
 * primary settings-tracked chat. Never throws.
 */
export async function sendTelegramPhotoTo(
  chatId: string,
  bytes: ArrayBuffer,
  filename: string,
  caption: string,
): Promise<{ ok: boolean; reason?: string }> {
  try {
    if (!chatId) return { ok: false, reason: 'no chat id' };
    const settings = await getSettings();
    const token = settings.telegramBotToken;
    if (!token) return { ok: false, reason: 'telegram not configured' };
    const json = await postPhoto(token, chatId, bytes, filename, caption);
    if (!json.ok) return { ok: false, reason: json.description };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'error' };
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

/**
 * Send PLAIN TEXT (no parse_mode) to a specific chat — safe for freeform
 * model output that may contain stray `<`, `&`, etc. that would break HTML
 * parse mode. Used by Prince's conversational replies. Never throws.
 */
export async function sendTelegramPlain(
  chatId: string,
  text: string,
): Promise<{ ok: boolean; reason?: string }> {
  try {
    if (!chatId) return { ok: false, reason: 'no chat id' };
    const token = (await getSettings()).telegramBotToken;
    if (!token) return { ok: false, reason: 'telegram not configured' };
    const res = await fetch(`${BASE}${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    const json = (await res.json()) as TgResponse;
    if (!json.ok) return { ok: false, reason: json.description };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'error' };
  }
}

/**
 * Second Telegram chat for the ABANDONED-CART sales team ("Bosslabs |
 * Closers"). Receives ONLY abandoned-cart + recovered-sale alerts — a pure
 * add-on alongside the main chat (which still gets everything). Configurable
 * via env; falls back to the team's chat id so it works without extra setup.
 * Uses the same bot token.
 */
const ABANDONED_TEAM_CHAT_ID = process.env.TELEGRAM_ABANDONED_CHAT_ID || '-5337635626';

export async function sendAbandonedTeam(
  text: string,
): Promise<{ ok: boolean; reason?: string }> {
  return sendTelegramTo(ABANDONED_TEAM_CHAT_ID, text);
}

/**
 * Third Telegram chat for ALL sales confirmations ("Bosslabs | Sales
 * Updates") — every paid webinar / OTO (Vault, 1:1) / retreat / bootcamp
 * sale lands here. Webinar-ticket sales land ONLY here (removed from the
 * main chat); every other sale type mirrors here in addition to wherever
 * else it's routed. Configurable via env; falls back to the team's chat id.
 * Uses the same bot token.
 */
const SALES_TEAM_CHAT_ID = process.env.TELEGRAM_SALES_CHAT_ID || '-5345976120';

export async function sendSalesTeam(
  text: string,
): Promise<{ ok: boolean; reason?: string }> {
  return sendTelegramTo(SALES_TEAM_CHAT_ID, text);
}

export async function sendSalesTeamPhoto(
  bytes: ArrayBuffer,
  filename: string,
  caption: string,
): Promise<{ ok: boolean; reason?: string }> {
  return sendTelegramPhotoTo(SALES_TEAM_CHAT_ID, bytes, filename, caption);
}

/** Escape HTML special chars for Telegram HTML parse mode. */
export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Render a light markdown string (from an LLM) into Telegram-safe HTML.
 * Escapes EVERYTHING first — so a stray `<` or `&` in the model's prose can
 * never break the parse — then re-introduces ONLY the tags we generate:
 * `**bold**` → <b>bold</b>. Nothing else is interpreted, so it's bulletproof.
 */
export function mdToTelegramHtml(s: string): string {
  return esc(s).replace(/\*\*([^*\n]+?)\*\*/g, '<b>$1</b>');
}
