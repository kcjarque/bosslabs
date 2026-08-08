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

/** The council's shared root-cause call (CPP decomposition) + the cohesive,
 *  ranked plan they converge on. `lever` names WHICH part of the funnel is
 *  the bottleneck; `root_cause` is one plain sentence; `evidence` cites the
 *  numbers. action_plan is 2–4 ordered steps, biggest CPP lever first. */
type Diagnosis = { root_cause: string; lever: string; evidence: string };
type ActionStep = { step: string; because: string; lever: string };
/** Net-new creative concepts to test next week — grounded in what's winning
 *  (angle/persona/hook), the untested tag whitespace, and the winning scripts. */
type CreativeIdea = { concept: string; angle: string; persona: string; hook: string; why: string };

type SessionJson = {
  snapshot: string[];
  floor: Array<{ expert: 'CHARLEY'|'NICK'|'BEN'|'DARA'; read: string; diagnosis: string;
    action: string; prediction: PredictionShape; confidence: 'High'|'Medium'|'Low' }>;
  cross_examination: string[];
  disagreement: string;
  diagnosis: Diagnosis;
  action_plan: ActionStep[];
  creative_ideas: CreativeIdea[];
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

/** The diagnostic spine — the council must first agree on WHY CPP is what it
 *  is (the CPP decomposition) before prescribing anything, then converge on
 *  one ranked plan. This is what turns per-ad verdicts into a strategy. */
const DIAGNOSTIC_SPINE =
  'DIAGNOSE THE ROOT CAUSE FIRST, then prescribe. CPP is driven by three levers: CPP ≈ CPM × (1/link-CTR) × (1/CVR). Using the numbers in the pack, the council must AGREE on which lever is the bottleneck:\n' +
  '- AUDIENCE (campaign-level): campaign.blendedCpm7 high or rising → it is expensive to REACH people (auction/audience), not a creative problem. Fix = test new audiences / broaden / narrow / new placements.\n' +
  '- CREATIVE (per-ad): the ad\'s linkCtr7 low or falling → the ad is not earning the click. Fix = a new creative; name the specific creativeTag + persona + hook to test, grounded in what is currently winning vs the untested whitespace in the creative mix (use each ad\'s creative object + the spread across ads).\n' +
  '- OFFER / POST-CLICK (campaign or per-ad): link-CTR is FINE but cvr7 is low (people click but do not buy) → the leak is AFTER the click: the offer, the landing page, or the audience clicks but is not the buyer. Fix the offer/landing/targeting-intent, NOT the creative.\n' +
  '- FATIGUE (per-ad): ctr7 falling AND freq7 rising across the window → creative wear-out. Fix = refresh the creative or cap frequency.\n' +
  'Audience/CPM problems are CAMPAIGN-level (the audience is shared); creative/CTR/fatigue problems are PER-AD. After diagnosing, the WHOLE council converges on ONE cohesive, ranked action_plan (2–4 steps, biggest CPP lever first), each step tied to the lever it fixes and specific enough to execute tomorrow. Record honest disagreement in dissent_on_record — do NOT manufacture consensus. Emit "diagnosis": {root_cause (one plain sentence), lever (one of: audience|creative|offer|fatigue|mixed|healthy), evidence (cite the actual numbers)} and "action_plan": [{step, because, lever}]. verdict.action stays the ONE plain-English headline a busy owner reads on their phone.';

/** Weekly memory — read the 4-week arc + grade your own past advice. This is
 *  what makes the analysis compound instead of resetting every week. */
const MEMORY_RULE =
  'USE THE MEMORY. The pack carries weeklyTrend (the last 4 weeks of blended CPP/CPM/link-CTR/CVR — read the ARC, is CPP trending up or down over the month?) and pastPlans (your last analyses + how many of each one\'s predictions HIT vs MISSED). Before prescribing, grade your OWN last plan: did it work? If a past plan\'s predictions MISSED or CPP kept climbing after you acted on that lever, say so explicitly and CHANGE approach — do not re-prescribe a move that already failed. If it HIT, build on it. Reference the trend in your reasoning (e.g. "third straight week CPM has climbed"). This is a weekly review, not a daily snapshot — think in weeks.';

/** Structure-awareness — recommendations must be EXECUTABLE given how each
 *  campaign is actually budgeted. Budget is never per-ad in Meta. */
const STRUCTURE_RULE =
  'RESPECT THE AD STRUCTURE. The pack\'s "structure" gives each campaign\'s budgetType (CBO/ABO/ADVANTAGE+) + ad sets, and every ad carries its campaignName/adSetName. Budget is NEVER set per-ad in Meta, so recommendations must use the RIGHT lever:\n' +
  '- CBO (budget on the campaign): you CANNOT lower one ad\'s budget. To cut a loser → turn the AD OFF (Meta reallocates its spend). To scale a winner → raise the CAMPAIGN budget or duplicate the winner into its own ad set/campaign.\n' +
  '- ABO (budget on the ad set): move budget at the AD-SET level. Ads in the same ad set share ONE budget — to favor one, turn the weaker ads OFF or split the winner into its own ad set.\n' +
  '- ADVANTAGE+/ASC (automated): almost no manual control — do NOT suggest per-ad or per-adset budget tweaks. Only real levers: add fresh creative, exclude a bad creative, or change the CAMPAIGN budget.\n' +
  'NEVER write "lower/trim this ad\'s budget" — it is not a real action. Note that ALL ads in one ad set share a budget (e.g. if 25 ads sit in one ad set, cutting one means turning it OFF, not budgeting it down). When unsure of the structure, default to "turn off" (always possible).';

/** Creative Ideas — propose the NEXT creatives to make, grounded in evidence. */
const CREATIVE_IDEAS_RULE =
  'PROPOSE CREATIVE IDEAS. Emit "creative_ideas": [2-3 net-new creative concepts to shoot/make next week]. Ground EVERY idea in the data, not generic advice: study pack.winningCreatives (the cheapest-per-buyer ads + their actual hooks/transcripts) for what is PROVEN to convert, and the creativeTag spread across ads for untested whitespace (tags/personas with little or no spend). Each idea = {concept (one line — what to make), angle (from the tag vocabulary), persona (from the persona vocabulary), hook (a specific opening line, in Taglish where natural, modeled on a winning script but for a fresh angle/persona), why (one line tying it to the evidence — a winning pattern to extend or a gap to fill)}. Favor angles/personas that are winning but under-produced, and the whitespace the roster is missing. Concrete enough that a creator could shoot it tomorrow.';

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

/** Salvageable defaults — a dropped diagnosis/plan never loses the whole
 *  (paid) session; it degrades to an empty call the UI just doesn't render. */
function normalizeDiagnosis(x: unknown): Diagnosis {
  const o = (typeof x === 'object' && x !== null ? x : {}) as Record<string, unknown>;
  return { root_cause: asStr(o.root_cause), lever: asStr(o.lever), evidence: asStr(o.evidence) };
}
function normalizeActionPlan(x: unknown): ActionStep[] {
  if (!Array.isArray(x)) return [];
  return x
    .map((s) => {
      const o = (typeof s === 'object' && s !== null ? s : {}) as Record<string, unknown>;
      return { step: asStr(o.step), because: asStr(o.because), lever: asStr(o.lever) };
    })
    .filter((s) => s.step);
}
function normalizeCreativeIdeas(x: unknown): CreativeIdea[] {
  if (!Array.isArray(x)) return [];
  return x
    .map((s) => {
      const o = (typeof s === 'object' && s !== null ? s : {}) as Record<string, unknown>;
      return { concept: asStr(o.concept), angle: asStr(o.angle), persona: asStr(o.persona), hook: asStr(o.hook), why: asStr(o.why) };
    })
    .filter((s) => s.concept);
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
    diagnosis: normalizeDiagnosis(p.diagnosis),
    action_plan: normalizeActionPlan(p.action_plan),
    creative_ideas: normalizeCreativeIdeas(p.creative_ideas),
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
  parsed.diagnosis.root_cause = collapseNewlines(parsed.diagnosis.root_cause);
  parsed.diagnosis.evidence = collapseNewlines(parsed.diagnosis.evidence);
  parsed.diagnosis.lever = collapseNewlines(parsed.diagnosis.lever);
  for (const s of parsed.action_plan) {
    s.step = collapseNewlines(s.step);
    s.because = collapseNewlines(s.because);
    s.lever = collapseNewlines(s.lever);
  }
  for (const i of parsed.creative_ideas) {
    i.concept = collapseNewlines(i.concept);
    i.hook = collapseNewlines(i.hook);
    i.why = collapseNewlines(i.why);
    i.angle = collapseNewlines(i.angle);
    i.persona = collapseNewlines(i.persona);
  }
}

export async function runCouncilSession(
  brand: Brand,
  triggerReasons: string[],
  opts: { model?: string } = {},
): Promise<{ sessionId: string; failedPredictionInserts: number }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');
  // Per-surface model: the weekly deep-dive passes Opus (highest stakes, low
  // frequency); the manual/on-demand run inherits the Sonnet default.
  const model = opts.model || MODEL;
  const pack = await assemblePack(brand, settledDay());
  const doctrine = readFileSync(path.join(process.cwd(), 'docs/ads-council/DOCTRINE.md'), 'utf8');
  const system = `${doctrine}\n\n=== RUNTIME RULES ===\nYou are the full council + Chair. Data mode: ${pack.dataMode}. ${pack.dataMode === 'A' ? 'DEGRADED MODE — reversible verdicts only, confidence capped Medium.' : ''}\nObey doctrine §5 output shape. Banned phrases: "monitor closely", "consider testing", "keep an eye on".\nThe verdict.action field is read by a non-technical business owner on their phone: write it as ONE plain-English imperative sentence naming the ad and the move (e.g. "Turn off the ad 'X' — it keeps showing to the same people without selling"). Say "turn off" or "pause", never "kill". No section references (§...), no jargon like "CPP", "frequency", "spend share", "fatigue definition" — put all that reasoning in transcript_md, never in action. NEVER recommend turning off an ad that is still producing sales at a reasonable cost in its most recent days — a rising cost on a small-budget ad is a "watch", not a cut.\nEach ad now carries a "creative" object (creativeTag/format/angle/persona/awarenessLevel/hook/visualQuality/onBrand/tags) describing WHAT the creative is. creativeTag is the headline label from a fixed vocabulary: Testimonial, Talking Head, Walkthrough, Problem-Based, Income Claim, Objection, Urgency, Graphic, Other. Reason about creative STRATEGY, not just numbers: which creativeTags/personas carry the winners vs which are saturated or untested, whether low-quality or off-brand (onBrand=false) creative explains weak performance, and what to test next. When you recommend testing a new creative, name it using this SAME vocabulary (e.g. "test a Problem-Based ad for the resto-owner persona") plus the specific hook to try, grounded in what is currently winning vs missing. creative may be null for not-yet-analyzed ads — treat that as "unknown", not a negative signal.\n${DIAGNOSTIC_SPINE}\n${MEMORY_RULE}\n${STRUCTURE_RULE}\n${CREATIVE_IDEAS_RULE}\n${UNIT_CONVENTIONS}\nRespond with ONLY a JSON object matching the provided schema — transcript_md holds the human-readable §5-format transcript.`;
  // The 2nd real dry run parsed as valid JSON but crashed sanitize() on an
  // undefined verdict/prediction field — the brief's shorthand named
  // "kill_switch" and "prediction" without ever spelling out that each is
  // an object requiring all 5 of {text,metric,threshold,target_id,
  // deadline_days}, so the model had to guess their inner shape. Spelled
  // out explicitly below; see also validateSessionJson, which now catches
  // and safely defaults exactly this class of gap regardless of prompt
  // wording.
  const user = JSON.stringify({ trigger_reasons: triggerReasons, pack,
    output_schema: 'SessionJson: {snapshot:string[], floor:[{expert,read,diagnosis,action,prediction:{text,metric,threshold,target_id,deadline_days},confidence}] (exactly 4 — one per CHARLEY,NICK,BEN,DARA), cross_examination:string[] (>=2 entries), disagreement:string, diagnosis:{root_cause:string, lever:"audience"|"creative"|"offer"|"fatigue"|"mixed"|"healthy", evidence:string}, action_plan:[{step:string, because:string, lever:string}] (2-4 ordered steps, biggest CPP lever first), creative_ideas:[{concept:string, angle:string, persona:string, hook:string, why:string}] (2-3 net-new creative concepts to test, grounded in winningCreatives + the untested tag/persona whitespace), verdict:{action,why_it_wins,what_it_costs,kill_switch:{text,metric,threshold,target_id,deadline_days},dissent_on_record,also_cleared:string[]}, transcript_md:string}. "prediction" and "kill_switch" are OBJECTS, not strings — every one of their 5 fields (text, metric, threshold, target_id, deadline_days) is REQUIRED and must never be omitted, even when metric is "" (non-machine-checkable): text/metric are always strings ("" allowed), threshold/target_id are number|null / string|null, deadline_days is an integer.' });
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
      model, max_tokens: 16000, system, messages: [{ role: 'user', content: user }],
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
    transcript_md: parsed.transcript_md,
    verdict: { ...parsed.verdict, diagnosis: parsed.diagnosis, action_plan: parsed.action_plan, creative_ideas: parsed.creative_ideas },
    model,
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
