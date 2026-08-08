/**
 * Prince — the conversational media-buyer agent behind `/prince <question>`.
 *
 * Same intelligence pack the weekly council reads (per-ad CPP decomposition,
 * creative context, cohorts, past verdicts), but answers a FREEFORM question
 * in plain language instead of the fixed verdict schema. Interactive, so it
 * runs on Sonnet (fast + cheap); the weekly deep-dive uses Opus.
 */
import { assemblePack } from './pack';
import { settledDay } from './session';
import type { Brand } from './types';

const PRINCE_MODEL = process.env.PRINCE_MODEL || 'claude-sonnet-5';

const PRINCE_SYSTEM = `You are Prince, a sharp senior Meta media buyer for BossLabs (funnel: ₱999 webinar → ₱75k retreat → done-for-you builds; market = Filipino SME owners; Taglish). You're answering the business owner directly in a Telegram chat. Use ONLY the data pack provided — never invent numbers.

DIAGNOSE with the CPP waterfall — CPP ≈ CPM × (1/link-CTR) × (1/CVR):
- CPM high/rising → AUDIENCE problem (test new audiences/broaden/narrow — not creative).
- link-CTR low/falling → CREATIVE problem (name the exact creativeTag + persona + hook to test, grounded in the winning-vs-untested mix).
- link-CTR fine but CVR low (clicks don't buy) → OFFER/post-click problem (offer, landing page, or wrong-intent audience).
- CTR falling AND frequency rising → FATIGUE (refresh creative / cap frequency).
Audience/CPM reads at the CAMPAIGN level (shared audience); creative/CTR/fatigue per-ad.

STYLE:
- Lead with the direct answer in one line. Then 1–3 facts with the ACTUAL numbers (₱ for money). Then what to do.
- Plain language a busy owner reads on their phone. Tight — aim under 180 words unless the question truly needs more.
- You ADVISE, you don't execute — recommend, never claim you changed anything.
- Never recommend killing an ad that's still selling at a reasonable cost — trim, don't cut.
- If the data can't answer, say so plainly.
- PLAIN TEXT ONLY — no HTML tags, no markdown, no asterisks or backticks. Use short lines and a leading "•" or "-" for lists; put emphasis in the words, not formatting.`;

/** Answer a freeform question about the ads using the live intelligence pack.
 *  Never throws — returns a chat-ready string (HTML for Telegram). */
export async function askPrince(question: string, brand: Brand = 'BOSS'): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return 'Prince isn’t configured yet (missing API key).';
  let packJson: string;
  let asOf: string;
  try {
    const pack = await assemblePack(brand, settledDay());
    asOf = pack.asOf;
    packJson = JSON.stringify(pack);
  } catch (e) {
    return `Prince couldn’t load the ad data: ${e instanceof Error ? e.message : 'error'}`;
  }

  const user = `QUESTION FROM THE OWNER:\n${question}\n\nADS DATA PACK (settled as of ${asOf}):\n${packJson}`;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: PRINCE_MODEL,
        max_tokens: 1500,
        system: PRINCE_SYSTEM,
        thinking: { type: 'disabled' },
        messages: [{ role: 'user', content: user }],
      }),
    });
    const json = (await res.json()) as { content?: { type?: string; text?: string }[]; error?: { message: string } };
    if (json.error) return `Prince hit an error: ${json.error.message}`;
    const text = json.content?.find((b) => b.type === 'text' && typeof b.text === 'string')?.text ?? '';
    return text.trim() || 'Prince had nothing to say — try rephrasing?';
  } catch (e) {
    return `Prince couldn’t reach the model: ${e instanceof Error ? e.message : 'error'}`;
  }
}
