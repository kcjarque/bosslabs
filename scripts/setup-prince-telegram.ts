/**
 * One-time (idempotent) setup for the Prince Telegram command.
 * Registers the webhook (with secret) + the /prince command in the bot menu.
 *
 *   npx tsx scripts/setup-prince-telegram.ts
 *
 * Requires TELEGRAM_WEBHOOK_SECRET in env (same value set on Vercel) and the
 * bot token in the settings table. Safe to re-run.
 */
import { readFileSync } from 'fs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  const v = m?.[2]?.trim().replace(/^["']|["']$/g, '');
  if (m && v && !process.env[m[1]]) process.env[m[1]] = v;
}

const WEBHOOK_URL = process.env.PRINCE_WEBHOOK_URL || 'https://www.bosslabs.live/api/telegram/webhook';

async function main() {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) throw new Error('TELEGRAM_WEBHOOK_SECRET not set');
  const { getSettings } = await import('@/lib/db');
  const token = (await getSettings()).telegramBotToken;
  if (!token) throw new Error('telegram bot token not set in settings');
  const base = `https://api.telegram.org/bot${token}`;

  const setWebhook = await fetch(`${base}/setWebhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      url: WEBHOOK_URL,
      secret_token: secret,
      allowed_updates: ['message'],
    }),
  }).then((r) => r.json());
  console.log('setWebhook:', JSON.stringify(setWebhook));

  const setCommands = await fetch(`${base}/setMyCommands`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      commands: [{ command: 'prince', description: 'Ask Prince anything about your ads' }],
    }),
  }).then((r) => r.json());
  console.log('setMyCommands:', JSON.stringify(setCommands));

  const info = await fetch(`${base}/getWebhookInfo`).then((r) => r.json());
  console.log('webhookInfo:', JSON.stringify(info.result ?? info));
}
main().catch((e) => { console.error(e); process.exit(1); });
