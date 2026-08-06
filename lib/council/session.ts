/** Ads Council LLM session runner — doctrine-driven full council debate
 *  (§5). Builds the system prompt from `docs/ads-council/DOCTRINE.md` +
 *  runtime rules, sends the assembled data pack (Task 8's `assemblePack`)
 *  to Anthropic, parses the structured verdict, and persists it to
 *  `council_sessions` + one `council_predictions` row per floor expert
 *  prediction + the Chair's kill switch. Raw `fetch` against the Messages
 *  API, matching this codebase's existing convention for external HTTP
 *  APIs (no new SDK dependency — see lib/council/meta-sync.ts). */
import { readFileSync } from 'fs';
import path from 'path';
import { getSupabase } from '@/lib/supabase';
import { assemblePack } from './pack';
import type { Brand } from './types';

const MODEL = process.env.COUNCIL_MODEL || 'claude-sonnet-5';

type PredictionShape = {
  text: string; metric: string; threshold: number | null;
  target_id: string | null; deadline_days: number;
};

type SessionJson = {
  snapshot: string[];
  floor: Array<{ expert: 'CHARLEY'|'NICK'|'BEN'|'DARA'; read: string; diagnosis: string;
    action: string; prediction: PredictionShape; confidence: 'High'|'Medium'|'Low' }>;
  cross_examination: string[];
  disagreement: string;
  verdict: { action: string; why_it_wins: string; what_it_costs: string;
    kill_switch: PredictionShape;
    dissent_on_record: string; also_cleared: string[] };
  transcript_md: string;
};

/** Unit-conventions rule (controller directive) — resolves a reviewer-
 *  flagged 100x hazard: doctrine §5.2's own example JSON shows
 *  `"cpp_7d": 629` with no unit annotation, which reads as pesos but every
 *  engine-computed CPP figure (verdict-engine.ts, ledger.ts's actualFor) is
 *  in CENTAVOS. Left unstated, an LLM predicting "₱629" would naturally
 *  emit `629` as the threshold instead of `62900`, silently breaking every
 *  machine-graded prediction by 100x. Appended verbatim to RUNTIME RULES. */
const UNIT_CONVENTIONS =
  'Prediction thresholds MUST be numeric in these units: cpp_7d and campaign_cpp_7d in CENTAVOS (₱600 = 60000); spend_share_7d as a FRACTION 0..1 (15% = 0.15). metric must be one of: cpp_7d, campaign_cpp_7d, spend_share_7d, or empty string for non-machine-checkable predictions. target_id = the ad_id for cpp_7d/spend_share_7d, null for campaign metrics.';

/** Extracts the outermost JSON object substring from `text` via a
 *  balanced-brace scan: start at the first '{', walk forward tracking
 *  nesting depth, and stop at the brace that closes depth back to 0.
 *  Correctly ignores braces that appear inside JSON string literals
 *  (tracks `"..."` runs and skips `\"`-escaped quotes so a value like
 *  `"use {curly} braces"` doesn't perturb depth or end the string early).
 *  This replaces a naive first-'{'-to-last-'}' substring, which breaks the
 *  moment trailing prose contains its own stray brace (e.g. "...{...}
 *  Let me know if you need any {changes}!" — last-'}' lands inside the
 *  prose, not at the JSON's real close). Throws a descriptive error
 *  instead of silently falling back when there's no '{' at all, or when
 *  depth never returns to 0 (truncated/malformed output) — both are
 *  genuine failures worth surfacing clearly rather than handing
 *  `JSON.parse` a doomed guess. */
export function extractJson(text: string): string {
  const start = text.indexOf('{');
  if (start === -1) {
    throw new Error(`extractJson: no '{' found in response text. First 200 chars: ${JSON.stringify(text.slice(0, 200))}`);
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  throw new Error(`extractJson: reached end of text with unbalanced braces (depth ${depth}) — response was likely truncated. First 200 chars from the opening brace: ${JSON.stringify(text.slice(start, start + 200))}`);
}

const asStr = (x: unknown): string => (typeof x === 'string' ? x : '');
const asStrArray = (x: unknown): string[] =>
  Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : [];

/** Safe default shared by `verdict.kill_switch` and every floor entry's
 *  `prediction` — a neutral, non-machine-checkable placeholder (empty
 *  metric, null threshold, 7-day deadline) rather than inventing numbers. */
function defaultPrediction(): PredictionShape {
  return { text: '', metric: '', threshold: null, target_id: null, deadline_days: 7 };
}

function normalizePrediction(x: unknown): PredictionShape {
  if (typeof x !== 'object' || x === null) return defaultPrediction();
  const o = x as Record<string, unknown>;
  return {
    text: asStr(o.text), metric: asStr(o.metric),
    threshold: typeof o.threshold === 'number' ? o.threshold : null,
    target_id: typeof o.target_id === 'string' ? o.target_id : null,
    deadline_days: typeof o.deadline_days === 'number' ? o.deadline_days : 7,
  };
}

/** Minimal §5-shaped fallback rendered only when the model's own
 *  transcript_md is missing — not a reproduction of buildBrief's format,
 *  just enough for a human to see what the Chair decided without losing
 *  the whole (already paid-for) session to one absent field. */
function renderFallbackTranscript(verdictAction: string, floor: SessionJson['floor']): string {
  const lines = [
    `VERDICT: ${verdictAction}`,
    '(transcript_md was missing from the model response; this is a minimal fallback rendered from the structured fields)',
    ...floor.map((f) => `${asStr(f.expert) || '?'}: ${asStr(f.action)}`),
  ];
  return lines.join('\n');
}

/** Narrows a parsed (`unknown`) Claude response into a `SessionJson`,
 *  called BEFORE sanitize() and before any DB write. `JSON.parse(...) as
 *  SessionJson` is a compile-time assertion only — nothing about it is
 *  checked at runtime, so a field the model dropped or reshaped is a real
 *  landmine (proven: the 2nd live dry-run attempt crashed sanitize() on
 *  exactly this). Two tiers:
 *  - UNSALVAGEABLE (throws, naming the missing path): no `verdict`, no
 *    `verdict.action`, or `floor` isn't a real array — a "session" missing
 *    any of these isn't a real council session worth persisting.
 *  - SALVAGEABLE (filled with a safe default so one incomplete field never
 *    loses an entire paid call's output): missing `kill_switch` or a
 *    floor entry's `prediction` → `defaultPrediction()`; missing
 *    `cross_examination`/`snapshot`/`also_cleared` → `[]`; missing
 *    `transcript_md` → a minimal rendered fallback; the remaining verdict
 *    prose fields (`why_it_wins`, `what_it_costs`, `dissent_on_record`,
 *    `disagreement`) → `''` if not already a string. */
export function validateSessionJson(parsed: unknown): SessionJson {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('validateSessionJson: response is not a JSON object');
  }
  const p = parsed as Record<string, unknown>;

  if (typeof p.verdict !== 'object' || p.verdict === null) {
    throw new Error('validateSessionJson: missing required field "verdict"');
  }
  const v = p.verdict as Record<string, unknown>;

  if (typeof v.action !== 'string') {
    throw new Error('validateSessionJson: missing required field "verdict.action"');
  }

  if (!Array.isArray(p.floor)) {
    throw new Error('validateSessionJson: missing or non-array required field "floor"');
  }

  const floor: SessionJson['floor'] = p.floor.map((f) => {
    const entry = (typeof f === 'object' && f !== null ? f : {}) as Record<string, unknown>;
    return {
      expert: entry.expert, read: entry.read, diagnosis: entry.diagnosis, action: entry.action,
      confidence: entry.confidence, prediction: normalizePrediction(entry.prediction),
    } as SessionJson['floor'][number];
  });

  return {
    snapshot: asStrArray(p.snapshot),
    floor,
    cross_examination: asStrArray(p.cross_examination),
    disagreement: asStr(p.disagreement),
    verdict: {
      action: v.action,
      why_it_wins: asStr(v.why_it_wins),
      what_it_costs: asStr(v.what_it_costs),
      kill_switch: normalizePrediction(v.kill_switch),
      dissent_on_record: asStr(v.dissent_on_record),
      also_cleared: asStrArray(v.also_cleared),
    },
    transcript_md: typeof p.transcript_md === 'string' ? p.transcript_md : renderFallbackTranscript(v.action, floor),
  };
}

/** Collapses any run of newlines to a single space — same hazard class
 *  lib/council/brief.ts's collapseNewlines fixes: an LLM-authored field
 *  that renders one-line downstream (a ledger row, a table cell) must
 *  never carry an embedded newline into that render. Guards against
 *  non-string input defensively — belt-and-suspenders on top of
 *  validateSessionJson, which already guarantees every field sanitize()
 *  touches is a real string by this point. */
function collapseNewlines(s: string): string {
  return typeof s === 'string' ? s.replace(/(\r\n|\n|\r)+/g, ' ') : '';
}

/** Applies collapseNewlines, in place, to every parsed.verdict + floor
 *  string field that later renders one-line: action, why_it_wins,
 *  what_it_costs, kill_switch.text, dissent_on_record, and each floor
 *  expert's prediction.text (also_cleared / snapshot / cross_examination /
 *  disagreement are multi-line-safe renders, so left untouched). */
function sanitize(parsed: SessionJson): void {
  parsed.verdict.action = collapseNewlines(parsed.verdict.action);
  parsed.verdict.why_it_wins = collapseNewlines(parsed.verdict.why_it_wins);
  parsed.verdict.what_it_costs = collapseNewlines(parsed.verdict.what_it_costs);
  parsed.verdict.kill_switch.text = collapseNewlines(parsed.verdict.kill_switch.text);
  parsed.verdict.dissent_on_record = collapseNewlines(parsed.verdict.dissent_on_record);
  for (const f of parsed.floor) f.prediction.text = collapseNewlines(f.prediction.text);
}

export async function runCouncilSession(
  brand: Brand,
  triggerReasons: string[],
): Promise<{ sessionId: string; failedPredictionInserts: number }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');
  const pack = await assemblePack(brand, settledDay());
  const doctrine = readFileSync(path.join(process.cwd(), 'docs/ads-council/DOCTRINE.md'), 'utf8');
  const system = `${doctrine}\n\n=== RUNTIME RULES ===\nYou are the full council + Chair. Data mode: ${pack.dataMode}. ${pack.dataMode === 'A' ? 'DEGRADED MODE — reversible verdicts only, confidence capped Medium.' : ''}\nObey doctrine §5 output shape. Banned phrases: "monitor closely", "consider testing", "keep an eye on".\nThe verdict.action field is read by a non-technical business owner on their phone: write it as ONE plain-English imperative sentence naming the ad and the move (e.g. "Turn off the ad 'X' — it keeps showing to the same people without selling"). Say "turn off" or "pause", never "kill". No section references (§...), no jargon like "CPP", "frequency", "spend share", "fatigue definition" — put all that reasoning in transcript_md, never in action. NEVER recommend turning off an ad that is still producing sales at a reasonable cost in its most recent days — a rising cost on a small-budget ad is a "watch", not a cut.\n${UNIT_CONVENTIONS}\nRespond with ONLY a JSON object matching the provided schema — transcript_md holds the human-readable §5-format transcript.`;
  // The 2nd real dry run parsed as valid JSON but crashed sanitize() on an
  // undefined verdict/prediction field — the brief's shorthand named
  // "kill_switch" and "prediction" without ever spelling out that each is
  // an object requiring all 5 of {text,metric,threshold,target_id,
  // deadline_days}, so the model had to guess their inner shape. Spelled
  // out explicitly below; see also validateSessionJson, which now catches
  // and safely defaults exactly this class of gap regardless of prompt
  // wording.
  const user = JSON.stringify({ trigger_reasons: triggerReasons, pack,
    output_schema: 'SessionJson: {snapshot:string[], floor:[{expert,read,diagnosis,action,prediction:{text,metric,threshold,target_id,deadline_days},confidence}] (exactly 4 — one per CHARLEY,NICK,BEN,DARA), cross_examination:string[] (>=2 entries), disagreement:string, verdict:{action,why_it_wins,what_it_costs,kill_switch:{text,metric,threshold,target_id,deadline_days},dissent_on_record,also_cleared:string[]}, transcript_md:string}. "prediction" and "kill_switch" are OBJECTS, not strings — every one of their 5 fields (text, metric, threshold, target_id, deadline_days) is REQUIRED and must never be omitted, even when metric is "" (non-machine-checkable): text/metric are always strings ("" allowed), threshold/target_id are number|null / string|null, deadline_days is an integer.' });
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    // max_tokens 16000 (not the brief's 8000) — headroom for this account's
    // genuinely large 4-expert transcript_md. thinking explicitly disabled:
    // claude-sonnet-5 thinks ADAPTIVELY BY DEFAULT when `thinking` is
    // omitted, and max_tokens is a hard cap on thinking + response text
    // combined. The first real dry run (no `thinking` param, default high
    // effort) burned the entire 16000-token budget on thinking alone —
    // stop_reason max_tokens, zero output tokens, empty text block, JSON.parse
    // failed on ''. This task is a well-specified synthesis (full doctrine +
    // explicit schema + explicit rules already in the prompt), not an
    // open-ended problem, so disabling thinking trades away chain-of-thought
    // for a deterministic guarantee that the whole budget goes to the
    // required output — confirmed working on the 3rd (successful) live run.
    body: JSON.stringify({
      model: MODEL, max_tokens: 16000, system, messages: [{ role: 'user', content: user }],
      thinking: { type: 'disabled' },
    }),
  });
  const json = (await res.json()) as {
    content?: { type?: string; text?: string }[];
    usage?: { input_tokens: number; output_tokens: number };
    stop_reason?: string;
    error?: { message: string };
  };
  if (json.error) throw new Error(`Anthropic: ${json.error.message}`);
  // Find the text block by type rather than assuming content[0] — robust
  // even with thinking disabled, since a refusal or a policy block can
  // still shape content[] unexpectedly.
  const textBlock = json.content?.find((b) => b.type === 'text' && typeof b.text === 'string');
  const rawText = textBlock?.text ?? '';
  let parsed: SessionJson;
  try {
    const raw = extractJson(rawText);
    parsed = validateSessionJson(JSON.parse(raw));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`session.ts: failed to parse/validate Claude response (${msg}). stop_reason=${json.stop_reason ?? 'unknown'}. Raw text (first 500 chars): ${rawText.slice(0, 500)}`);
  }
  sanitize(parsed);

  const sb = getSupabase();
  const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
  const { data, error } = await sb.from('council_sessions').insert({
    date: today, brand, trigger_reasons: triggerReasons, data_mode: pack.dataMode,
    transcript_md: parsed.transcript_md, verdict: parsed.verdict, model: MODEL,
    input_tokens: json.usage?.input_tokens ?? null, output_tokens: json.usage?.output_tokens ?? null,
  }).select('id').single();
  if (error) throw new Error(`council_sessions insert: ${error.message}`);
  const sessionId = (data as { id: string }).id;

  const preds = [
    ...parsed.floor.map((f) => ({ expert: f.expert, p: f.prediction, taken: false })),
    { expert: 'CHAIR' as const, p: parsed.verdict.kill_switch, taken: true },
  ];
  let failedPredictionInserts = 0;
  for (const { expert, p, taken } of preds) {
    const { error: predError } = await sb.from('council_predictions').insert({
      date: today, brand, expert, session_id: sessionId, action_taken: taken,
      prediction_text: p.text, metric: p.metric ?? '', threshold: p.threshold,
      target_id: p.target_id, weight: taken ? 1.0 : 0.25,
      deadline: new Date(Date.now() + (p.deadline_days ?? 7) * 86400000 + 8 * 3600_000).toISOString().slice(0, 10),
      needs_manual: !p.metric,
    });
    if (predError) {
      console.error(`[runCouncilSession] council_predictions insert failed for ${expert}: ${predError.message}`);
      failedPredictionInserts++;
    }
  }
  return { sessionId, failedPredictionInserts };
}

export function settledDay(): string {
  return new Date(Date.now() - 3 * 86400000 + 8 * 3600_000).toISOString().slice(0, 10);
}
