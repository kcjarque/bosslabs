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
import { assemblePack, type CouncilPack } from './pack';
import type { Brand } from './types';
import type { Confidence } from './confidence';

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

/** Stage-1 problem-classification taxonomy (spec §0b) — the fix depends on
 *  the type: malfunction is ruled out FIRST (something is just broken),
 *  market is account-wide auction pressure (never a per-ad fault, never a
 *  restructure), the rest are the usual CPP-decomposition levers. */
type ProblemType =
  | 'malfunction' | 'creative' | 'fatigue' | 'audience' | 'offer' | 'setup' | 'algorithm' | 'market';
/** One Stage-1 finding (braindump + classify), backed by a confidence-tiered
 *  evidence read (§0b minimum-signal rule). severity is the coarse label;
 *  pesoImpact — whole PESOS, not centavos — is what ranking and the §5a
 *  severity floor actually key off. */
type Problem = {
  type: ProblemType; description: string; severity: 'high' | 'medium' | 'low';
  pesoImpact: number; evidence: { confidence: Confidence; text: string };
};
/** Stage-4 fix for one confirmed (above-floor) problem. `problem` names
 *  which problem this addresses (matches its description). */
type Solution = { problem: string; fix: string; lever: string; expectedEffect: string };

type SessionJson = {
  snapshot: string[];
  floor: Array<{ expert: 'CHARLEY'|'NICK'|'BEN'|'DARA'; read: string; diagnosis: string;
    action: string; prediction: PredictionShape; confidence: 'High'|'Medium'|'Low' }>;
  cross_examination: string[];
  disagreement: string;
  diagnosis: Diagnosis;
  action_plan: ActionStep[];
  creative_ideas: CreativeIdea[];
  /** Stage 1 — every ABOVE-floor problem found this week, classified by
   *  type and ranked by pesoImpact. Below-floor/NOISE-tier findings go in
   *  `watchlist` instead (§5a severity floor, §0b NULL-RESULT LAW) — this
   *  stays `[]` on a genuinely healthy week. */
  problems: Problem[];
  /** Stage 4 — one concrete, structure-aware fix per confirmed problem. */
  solutions: Solution[];
  /** Stage 5 — the cohesive briefing paragraph tying problems→solutions to
   *  the profit picture, ranked by business impact. */
  synthesis: string;
  /** Below-floor / NOISE-tier items kept OUT of the main briefing (§5a
   *  severity floor, §0b minimum-signal) — named so nothing silently
   *  vanishes, just demoted. Always carries at least one entry, even on a
   *  clean week (the NULL-RESULT LAW's "name the ONE thing to watch"). */
  watchlist: Array<{ item: string; why: string }>;
  verdict: { action: string; why_it_wins: string; what_it_costs: string;
    kill_switch: PredictionShape;
    dissent_on_record: string; also_cleared: string[] };
  transcript_md: string;
};

/** §0 persona — the north star for every rule below: Prince is a complete
 *  senior media buyer with a Fortune-500 buyer's instincts AND the business
 *  owner's acumen — judges on profit, not vanity metrics; decides what
 *  actually matters instead of reciting the pack; holds the same standard
 *  at any budget scale. */
const PERSONA_RULE =
  'PERSONA (§0) — You are a complete senior media buyer: the instincts of a Fortune-500 performance lead PLUS the acumen of the business owner. Hold three traits at once:\n' +
  '- BUSINESS-OWNER MINDSET: every read and recommendation serves ONE objective — make the business earn more and spend less. Think in profit, ROAS, and growth, never vanity metrics. Frame every move as a business lever: EARN MORE (scale winners, raise budgets, lean into efficient audiences/placements, test into whitespace) or SPEND LESS (cut waste, fix leaks, reallocate off draggers, stop paying for the wrong crowd). Profit, not just efficiency — see PROFIT ANCHOR below.\n' +
  '- JUDGMENT, NOT RECITATION: you have all the data in the pack, but a senior buyer does not recite dashboards. Decide which 1-3 signals actually matter right now and act on them — everything else is reserve, drawn on only if it changes the call or the owner asks.\n' +
  '- ADAPTS TO ANY SCENARIO AND SCALE: the same brain applies whether the budget is ₱1k/day or ₱1M/day, whether the account is scaling, bleeding, stabilizing, or launching. Thresholds are relative (vs target / prior / blended), never hardcoded to one business size.';

/** §0b — the 5-stage analysis method plus the two hard rules (NULL-RESULT,
 *  MINIMUM-SIGNAL) that keep it honest. Directly shapes the new
 *  problems/solutions/synthesis/watchlist output fields. */
const METHOD_RULE =
  'THE 5-STAGE METHOD (§0b) — every analysis follows this flow; no stage is trusted until challenged by the rest of the floor:\n' +
  'STAGE 1 — FIND & CLASSIFY ALL PROBLEMS (divergent first). Braindump every problem visible across the account, then tag each by TYPE, because the fix depends on the type. Emit "problems": [{type, description, severity, pesoImpact, evidence:{confidence, text}}]:\n' +
  '  - malfunction (RULE OUT FIRST): something is BROKEN — a disapproved ad (WITH_ISSUES), pixel/tracking not firing (spend continues but purchases/revenue cliff to ~0), a landing page down (lpViewRate collapses), any metric falling off a cliff overnight. Check pack.malfunctions first — it is a deterministic pre-check of exactly this. A senior buyer asks "is it just broken?" before optimizing anything — NEVER prescribe a creative fix for a tracking outage.\n' +
  '  - creative: the ad is not earning the click/watch (link-CTR, hook/hold).\n' +
  '  - fatigue: a working ad wearing out (CTR falling + frequency rising).\n' +
  '  - audience: expensive to reach the right people (CPM, placement, demo).\n' +
  '  - offer: clicks do not convert (CVR, LP-view-to-purchase) — the leak is after the click.\n' +
  '  - setup: misconfiguration (wrong optimization goal, budget too low to exit learning, CBO starving a winner, wrong objective for the goal).\n' +
  '  - algorithm: learning not resolving, spend mis-allocating, Advantage+ mis-delivering.\n' +
  '  - market: broad, SIMULTANEOUS cost inflation across ALL campaigns/ads at once — external auction pressure (seasonality, competition, election/holiday surges), NOT a per-ad fault. Fix is hold / reprice / ride it out — NEVER restructure.\n' +
  '  NULL-RESULT LAW: a healthy account is a valid finding. If nothing crosses the severity floor (see OUTPUT DISCIPLINE below), say so in synthesis ("nothing needs fixing this week"), name the ONE thing to watch in watchlist, and STOP — do NOT manufacture problems to fill the stage. "Braindump every problem" means list what is genuinely wrong, never invent something to look busy.\n' +
  'STAGE 2 — identify which data matters to each problem (do not boil the ocean): map each problem to its diagnostic metric(s) — creative to link-CTR/hook, fatigue to CTR-trend+frequency, audience to CPM/placement/demo, offer to CVR/funnel, setup to structure/optimization, malfunction to status/metric-cliff. (The diagnostic-spine, creative-quality, structure, and movement rules further below are exactly this mapping, spelled out in full.)\n' +
  'STAGE 3 — find the evidence where it matters: the specific proof — the placement dragging, the creative context, the demo segment, the funnel step that leaks, the day a metric cliffed. Real numbers, not vibes. MINIMUM-SIGNAL RULE — every evidence read (an ad, a placement, a segment, a day-of-week, a funnel step) is tagged by how much data backs it: SOLID (>= ~10 purchases OR spend >= ~3x blended CPA in the window), DIRECTIONAL (>= 3 purchases OR spend >= ~1x blended CPA), NOISE (below that). pack.thisWeek.ads[] already carries each ad\'s own precomputed confidence — use it. HARD RULE: no cut / scale / exclude recommendation may EVER rest on NOISE-tier evidence — a NOISE read belongs ONLY in watchlist. DIRECTIONAL reads MUST be labeled "DIRECTIONAL" in the evidence text. Day-of-week context is capped at DIRECTIONAL by definition (only 4 samples/weekday). Record the tier in problems[].evidence.confidence.\n' +
  'STAGE 4 — provide solutions: per CONFIRMED (above-floor) problem, the concrete executable fix, framed earn-more or spend-less, structure-aware (see the structure rule further below). Emit "solutions": [{problem, fix, lever, expectedEffect}] — one entry per problem that has an actionable fix (a market/auction hold, or a pure watch item, may have none).\n' +
  'STAGE 5 — full analysis: synthesize everything into one cohesive briefing, ranked by business impact (peso impact, highest first), with honest dissent on record. Emit "synthesis": a short paragraph a busy owner reads once, tying the ranked problems to the plan and the profit picture.';

/** §3h — every scale/cut/hold call is judged against the economics block,
 *  never a raw ROAS/CPP number, and tied to the ₱50k/day net goal. */
const PROFIT_ANCHOR_RULE =
  'PROFIT ANCHOR (§3h) — every scale / cut / hold call is judged AGAINST pack.settings.economics, never as a raw number:\n' +
  '- targetRoas (front-end ROAS target — below it is flagged), breakevenRoas (front end LOSES money below this), targetCppCentavos (the CAC ceiling). A ROAS or CPP is only meaningful stated as above/below one of these — never cite a bare "2.49x" without saying whether that clears target or merely breakeven.\n' +
  '- THE NORTH STAR: pack.thisWeek.northStar carries currentDailyNetCentavos (today\'s actual daily net = revenue - spend - processing), targetNetSpendCentavos (spend/day needed to hit the net target at targetRoas), and netGapCentavos (the shortfall to settings.economics.dailyNetTargetCentavos — the ₱50k/day net goal). Frame the weekly plan around CLOSING that gap: name it in pesos and the specific move that closes it (e.g. "we are ~₱25k/day short of ₱50k — scaling the 2.4x winners by ₱X/day closes it"), never a generic "improve performance." Any gap-closing scale-up still obeys the scaling-velocity guardrail (see OUTPUT DISCIPLINE below) — steps, not overnight jumps.\n' +
  '- IF pack.settings.economics.configured is false: say out loud that you are "judging without a profit anchor — efficiency reads, not profit calls," and default CONSERVATIVE (treat breakeven as ~1.0x; do not greenlight scaling on ROAS alone).';

/** §2 — the temporal spine: THE WEEK is the subject, everything else in the
 *  pack is background that explains it, never the thing being graded. */
const SCOPE_RULE =
  'SCOPE LAW (§2) — you are judging THE WEEK: pack.thisWeek (the just-finished Mon-Sun, pack.weekStart to pack.weekEnd). Its last ~3 days (after pack.settledCutoff) are still inside Meta\'s attribution window — carried but ROUGH; lean hard calls on the settled Mon-Thu portion and treat the fresh tail as directional. Everything else in the pack is CONTEXT that EXPLAINS the week, never the subject you grade:\n' +
  '- pack.ads[] / pack.campaign (the older settled trailing-7 figures), pack.weeklyTrend (4-week arc), pack.pastPlans (self-grade), pack.cohorts, pack.structure, pack.recentChanges — all CONTEXT. Use them to explain WHY the week looks the way it does ("CPP up this week — third straight week frequency climbed"), never grade the history itself, and never let a lifetime/blended figure override what pack.thisWeek actually shows.\n' +
  '- When this-week and history disagree, THE WEEK WINS as the subject of the verdict; history only supplies the "why."';

/** §5a — signal over noise: the output discipline that keeps the persona
 *  above sharp instead of a dashboard recitation. */
const OUTPUT_DISCIPLINE_RULE =
  'OUTPUT DISCIPLINE (§5a) — signal over noise; this is the whole point of the persona above:\n' +
  '- LEAD WITH THE DECISION, not the data — the one-line bottom line first, in both synthesis and verdict.action.\n' +
  '- CITE ONLY THE 1-3 NUMBERS THAT DRIVE THE CALL. The rest of the pack is reserve — reference it only if it changes the recommendation or the owner asks. NO METRIC-DUMPING: say "Cut FB Reels — it is eating ₱62k at 1.29x while Feed does 2.28x; move it to Feed + Stories," never a table of every placement. Having 10 data points is for KNOWING what to look at, not for reciting all 10.\n' +
  '- SEVERITY FLOOR: a problem whose plausible impact is < ~5% of pack.thisWeek.campaign.spend does NOT belong in problems/solutions/synthesis — put it in "watchlist": [{item, why}] instead. The main briefing carries only above-floor problems, ranked by pesoImpact, highest first.\n' +
  '- SCALING-VELOCITY GUARDRAIL: budget raises of more than ~20-30%/day risk re-entering learning, and any significant edit resets learning — so scale winners in STEPS across several days, never overnight, and say so in the fix/expectedEffect.\n' +
  '- Name the scenario (scaling / bleeding / stabilizing / launching) and advise for THAT situation, at THIS budget scale.';

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

/** Creative-quality + funnel decomposition — go deeper than link-CTR/CVR. */
const CREATIVE_METRICS_RULE =
  'CREATIVE QUALITY & FUNNEL DEPTH — each ad now carries finer signals; use them to pinpoint the fix:\n' +
  '- hookRate7 = 3-second view rate (thumbstop — does the FIRST 3 SECONDS stop the scroll). holdRate7 = % of those who kept watching (does the body hold them). These are VIDEO-ONLY and are null on IMAGE ads — NEVER fault an image for a missing/low hook or hold rate; judge images on link-CTR + CVR only.\n' +
  '  · Low hookRate on a video → the OPENING is the problem: fix the first 3 seconds (new hook/first frame), not the whole ad.\n' +
  '  · Good hookRate but low holdRate → the hook works, the body loses them: tighten the middle/CTA.\n' +
  '  · Good hook + hold but low link-CTR → the watch is fine, the offer/CTA in-video is weak.\n' +
  '- CVR now decomposes: lpViewRate7 = % of clicks that actually LOADED the landing page (low → slow page / people bounce before it loads — a tech/page problem, not creative). viewToPurchase7 = % of landers who bought (low → the offer/page/wrong-intent audience). Use these to say WHERE post-click the money leaks instead of a vague "CVR problem".';

/** Account is a living system — attribute shifts to real edits + never judge
 *  something still in learning. */
const MOVEMENT_LEARNING_RULE =
  'ACCOUNT MOVEMENT & LEARNING PHASE — read the account as a living system, not a snapshot:\n' +
  '- CURRENT ON/OFF STATE: each ad carries active (true only if it is DELIVERING right now) + status (ACTIVE / PAUSED / ADSET_PAUSED / CAMPAIGN_PAUSED / WITH_ISSUES). A paused ad still shows its historical metrics — that data does NOT mean it is running. IRON RULE: only ACTIVE ads can be turned off, scaled, or "let run". NEVER recommend turning OFF, cutting, or lowering an ad whose active=false — it is already off (its numbers are just history); saying "turn off X" when X is paused makes you look like you are only reading stale data. NEVER say "let it run / keep it running / give it time" for a non-active ad — it is not running. For a paused ad that clearly WORKED (cheap CPP, real volume), the only valid move is "turn it back ON / relaunch it"; for a paused loser, say nothing or note it is already handled. Prescribe on/off/budget/scale actions ONLY on ACTIVE ads.\n' +
  '- pack.recentChanges lists what CHANGED in the last week (budgets moved, ads/campaigns turned on/off, new ads/ad sets built). ATTRIBUTE performance shifts to these edits ("CPP dropped after FINALCALL 3 was paused 3 days ago") instead of guessing, and account for them in the plan.\n' +
  '- LEARNING PHASE: each ad set in pack.structure has learningStatus. NEVER judge or recommend cutting an ad whose ad set is still LEARNING — early CPP is noise until it stabilizes (~50 conversions). If learningStatus is LEARNING_LIMITED, that is a STRUCTURAL problem (too little budget/too few conversions to ever exit) → recommend consolidating ad sets or raising budget, NOT killing ads. lastSignificantEditDays: a significant edit RESETS learning, so an ad set edited in the last ~3 days is re-learning — leave it alone.\n' +
  '- Each ad has ageDays; an ad under ~5 days old is too YOUNG to judge on CPP. Give it time.\n' +
  'Do NOT prescribe changes to anything still learning or just edited — that resets learning and wastes spend.';

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
/** Stage-1 problems (§0b) — `type`/`severity`/`evidence.confidence` are
 *  passed through as-is (same laxness as `floor[].expert`/`confidence`
 *  above: this function guarantees STRUCTURE, not enum membership).
 *  Entries missing `description` are dropped, mirroring
 *  normalizeActionPlan/normalizeCreativeIdeas' filter-on-primary-field
 *  convention. */
function normalizeProblems(x: unknown): Problem[] {
  if (!Array.isArray(x)) return [];
  return x
    .map((p) => {
      const o = (typeof p === 'object' && p !== null ? p : {}) as Record<string, unknown>;
      const ev = (typeof o.evidence === 'object' && o.evidence !== null ? o.evidence : {}) as Record<string, unknown>;
      return {
        type: o.type, description: asStr(o.description), severity: o.severity,
        pesoImpact: typeof o.pesoImpact === 'number' ? o.pesoImpact : 0,
        evidence: { confidence: ev.confidence, text: asStr(ev.text) },
      } as Problem;
    })
    .filter((p) => p.description);
}
function normalizeSolutions(x: unknown): Solution[] {
  if (!Array.isArray(x)) return [];
  return x
    .map((s) => {
      const o = (typeof s === 'object' && s !== null ? s : {}) as Record<string, unknown>;
      return { problem: asStr(o.problem), fix: asStr(o.fix), lever: asStr(o.lever), expectedEffect: asStr(o.expectedEffect) };
    })
    .filter((s) => s.fix);
}
function normalizeWatchlist(x: unknown): SessionJson['watchlist'] {
  if (!Array.isArray(x)) return [];
  return x
    .map((s) => {
      const o = (typeof s === 'object' && s !== null ? s : {}) as Record<string, unknown>;
      return { item: asStr(o.item), why: asStr(o.why) };
    })
    .filter((s) => s.item);
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
 *    `disagreement`) → `''` if not already a string; missing
 *    `problems`/`solutions`/`watchlist` → `[]` and missing `synthesis` →
 *    `''` (same never-throw treatment as `action_plan`/`creative_ideas`). */
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
    problems: normalizeProblems(p.problems),
    solutions: normalizeSolutions(p.solutions),
    synthesis: asStr(p.synthesis),
    watchlist: normalizeWatchlist(p.watchlist),
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
  const system = `${doctrine}\n\n=== RUNTIME RULES ===\nYou are the full council + Chair. Data mode: ${pack.dataMode}. ${pack.dataMode === 'A' ? 'DEGRADED MODE — reversible verdicts only, confidence capped Medium.' : ''}\n${PERSONA_RULE}\n${METHOD_RULE}\n${PROFIT_ANCHOR_RULE}\n${SCOPE_RULE}\n${OUTPUT_DISCIPLINE_RULE}\nObey doctrine §5 output shape. Banned phrases: "monitor closely", "consider testing", "keep an eye on".\nThe verdict.action field is read by a non-technical business owner on their phone: write it as ONE plain-English imperative sentence naming the ad and the move (e.g. "Turn off the ad 'X' — it keeps showing to the same people without selling"). Say "turn off" or "pause", never "kill". No section references (§...), no jargon like "CPP", "frequency", "spend share", "fatigue definition" — put all that reasoning in transcript_md, never in action. NEVER recommend turning off an ad that is still producing sales at a reasonable cost in its most recent days — a rising cost on a small-budget ad is a "watch", not a cut.\nEach ad now carries a "creative" object (creativeTag/format/angle/persona/awarenessLevel/hook/visualQuality/onBrand/tags) describing WHAT the creative is. creativeTag is the headline label from a fixed vocabulary: Testimonial, Talking Head, Walkthrough, Problem-Based, Income Claim, Objection, Urgency, Graphic, Other. Reason about creative STRATEGY, not just numbers: which creativeTags/personas carry the winners vs which are saturated or untested, whether low-quality or off-brand (onBrand=false) creative explains weak performance, and what to test next. When you recommend testing a new creative, name it using this SAME vocabulary (e.g. "test a Problem-Based ad for the resto-owner persona") plus the specific hook to try, grounded in what is currently winning vs missing. creative may be null for not-yet-analyzed ads — treat that as "unknown", not a negative signal.\n${DIAGNOSTIC_SPINE}\n${CREATIVE_METRICS_RULE}\n${MEMORY_RULE}\n${STRUCTURE_RULE}\n${MOVEMENT_LEARNING_RULE}\n${CREATIVE_IDEAS_RULE}\n${UNIT_CONVENTIONS}\nRespond with ONLY a JSON object matching the provided schema — transcript_md holds the human-readable §5-format transcript.`;
  // The 2nd real dry run parsed as valid JSON but crashed sanitize() on an
  // undefined verdict/prediction field — the brief's shorthand named
  // "kill_switch" and "prediction" without ever spelling out that each is
  // an object requiring all 5 of {text,metric,threshold,target_id,
  // deadline_days}, so the model had to guess their inner shape. Spelled
  // out explicitly below; see also validateSessionJson, which now catches
  // and safely defaults exactly this class of gap regardless of prompt
  // wording.
  const user = JSON.stringify({ trigger_reasons: triggerReasons, pack,
    output_schema: 'SessionJson: {snapshot:string[], floor:[{expert,read,diagnosis,action,prediction:{text,metric,threshold,target_id,deadline_days},confidence}] (exactly 4 — one per CHARLEY,NICK,BEN,DARA), cross_examination:string[] (>=2 entries), disagreement:string, diagnosis:{root_cause:string, lever:"audience"|"creative"|"offer"|"fatigue"|"mixed"|"healthy", evidence:string}, action_plan:[{step:string, because:string, lever:string}] (2-4 ordered steps, biggest CPP lever first), creative_ideas:[{concept:string, angle:string, persona:string, hook:string, why:string}] (2-3 net-new creative concepts to test, grounded in winningCreatives + the untested tag/persona whitespace), problems:[{type:"malfunction"|"creative"|"fatigue"|"audience"|"offer"|"setup"|"algorithm"|"market", description:string, severity:"high"|"medium"|"low", pesoImpact:number, evidence:{confidence:"SOLID"|"DIRECTIONAL"|"NOISE", text:string}}] (§0b Stage 1 — every ABOVE-floor problem found this week, ranked by pesoImpact descending; below-floor or NOISE-tier items go in watchlist instead, never here — [] on a genuinely healthy week per the NULL-RESULT LAW), solutions:[{problem:string, fix:string, lever:string, expectedEffect:string}] (§0b Stage 4 — one concrete, structure-aware fix per confirmed problem; "problem" must match the description of the problems[] entry it addresses), synthesis:string (§0b Stage 5 — one cohesive briefing paragraph ranked by business impact; on a healthy week, plainly say "nothing needs fixing this week" per the NULL-RESULT LAW), watchlist:[{item:string, why:string}] (below-floor / NOISE-tier items kept OUT of problems — on a healthy week this still names the ONE thing to watch), verdict:{action,why_it_wins,what_it_costs,kill_switch:{text,metric,threshold,target_id,deadline_days},dissent_on_record,also_cleared:string[]}, transcript_md:string}. "prediction" and "kill_switch" are OBJECTS, not strings — every one of their 5 fields (text, metric, threshold, target_id, deadline_days) is REQUIRED and must never be omitted, even when metric is "" (non-machine-checkable): text/metric are always strings ("" allowed), threshold/target_id are number|null / string|null, deadline_days is an integer. pesoImpact is a plain PESO number (e.g. 5000 means ₱5,000/week), NOT centavos — do not multiply by 100.' });
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
    verdict: { ...parsed.verdict, diagnosis: parsed.diagnosis, action_plan: parsed.action_plan, creative_ideas: parsed.creative_ideas,
      problems: parsed.problems, solutions: parsed.solutions, synthesis: parsed.synthesis, watchlist: parsed.watchlist },
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

/* =============================================================================
 * STAGED COUNCIL — the weekly multi-pass orchestrator (spec §0b "Staged
 * council (Hybrid — decided)", docs/ads-council/2026-08-09-prince-analysis-v2-
 * design.md). `runCouncilSession` above is untouched and keeps serving
 * on-demand/manual runs as one call. `runStagedCouncil` below is the weekly
 * path: 4 SEPARATE Messages API calls, one per phase of the 5-stage method
 * (§0b) — problems (Stage 1) → cross-examine + pick data (Stage 2) →
 * evidence (Stage 3) → solutions + synthesis + the floor debate + verdict
 * (Stages 4-5) — where each call's user message includes the PRIOR call's
 * validated JSON output, so later stages genuinely challenge earlier ones
 * instead of one completion free-associating the whole analysis at once.
 * Persists via the exact same council_sessions + council_predictions shape
 * as runCouncilSession (persistSession below IS that insert logic, copied
 * out so runCouncilSession's own body stays untouched).
 * ========================================================================== */

/** The weekly deep-dive's model. Mirrors pipeline.ts's own (private)
 *  WEEKLY_MODEL constant rather than importing it — pipeline.ts still calls
 *  runCouncilSession directly today; wiring it to call runStagedCouncil
 *  instead is a later task, so the two constants are intentionally
 *  duplicated for now, not shared. */
const WEEKLY_MODEL = process.env.COUNCIL_WEEKLY_MODEL || 'claude-opus-5';

/** §5a severity floor — "a problem whose plausible impact is < ~5% of
 *  pack.thisWeek.campaign.spend" belongs in watchlist, not problems. */
const SEVERITY_FLOOR_PCT = 0.05;

/** pack.thisWeek.campaign.spend is CENTAVOS (weekWindow sums AdDay's
 *  spendCentavos straight through — see week-window.test.ts), while
 *  Problem.pesoImpact is a plain PESO number (UNIT_CONVENTIONS'
 *  neighboring rule for prediction thresholds is exactly this class of
 *  100x hazard). Converting once here, in code, means no pass ever has to
 *  do a centavos→pesos conversion inside its own reasoning. */
function severityFloorPesos(pack: CouncilPack): number {
  return (pack.thisWeek.campaign.spend / 100) * SEVERITY_FLOOR_PCT;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

type TokenUsage = { input_tokens: number; output_tokens: number };

/** Sums usage across passes so the persisted council_sessions row reflects
 *  the TOTAL cost of the whole staged run (1 call on the null-result path,
 *  otherwise 4) rather than just the last call's usage, which would
 *  understate real spend by up to 4x. */
function addUsage(a: TokenUsage | null, b: TokenUsage | null): TokenUsage | null {
  if (!a && !b) return null;
  return { input_tokens: (a?.input_tokens ?? 0) + (b?.input_tokens ?? 0), output_tokens: (a?.output_tokens ?? 0) + (b?.output_tokens ?? 0) };
}

/** One non-streaming Messages API call, thinking disabled — the same
 *  request shape runCouncilSession's inline fetch uses (see its comment on
 *  why thinking is disabled), factored out here so the 4 staged passes
 *  don't each duplicate the fetch/parse boilerplate. This is NEW code, not
 *  a refactor of runCouncilSession — its own inline call is untouched. */
async function callClaude(
  key: string, model: string, system: string, user: string,
): Promise<{ text: string; usage: TokenUsage | null; stopReason: string | undefined }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model, max_tokens: 16000, system, messages: [{ role: 'user', content: user }],
      thinking: { type: 'disabled' },
    }),
  });
  const json = (await res.json()) as {
    content?: { type?: string; text?: string }[];
    usage?: TokenUsage;
    stop_reason?: string;
    error?: { message: string };
  };
  if (json.error) throw new Error(`Anthropic: ${json.error.message}`);
  const textBlock = json.content?.find((b) => b.type === 'text' && typeof b.text === 'string');
  return { text: textBlock?.text ?? '', usage: json.usage ?? null, stopReason: json.stop_reason };
}

type StageProblems = { problems: Problem[]; watchlist: SessionJson['watchlist'] };

/** Subset validator for Passes 1-3, which only ever produce
 *  {problems, watchlist} (§0b Stages 1-3) — reuses the SAME
 *  normalizeProblems/normalizeWatchlist helpers validateSessionJson uses,
 *  so a staged pass's entries are held to the identical structural
 *  contract as the single-pass session. Only throws on a genuinely
 *  non-object top-level response (mirrors validateSessionJson's own
 *  top-level guard) — every missing/malformed field inside normalizes to a
 *  safe default via the shared normalize* helpers. */
function validateStageProblems(parsed: unknown): StageProblems {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('validateStageProblems: response is not a JSON object');
  }
  const p = parsed as Record<string, unknown>;
  return { problems: normalizeProblems(p.problems), watchlist: normalizeWatchlist(p.watchlist) };
}

/** Shared output contract for Passes 1-3 — identical shape at every stage
 *  (only the SYSTEM prompt's instructions about what to keep/prune/enrich
 *  change between passes), reusing the exact pesoImpact unit-convention
 *  sentence from runCouncilSession's own schema text. */
const STAGE_PROBLEMS_SCHEMA =
  'Respond with ONLY a JSON object: {problems:[{type:"malfunction"|"creative"|"fatigue"|"audience"|"offer"|"setup"|"algorithm"|"market", description:string, severity:"high"|"medium"|"low", pesoImpact:number, evidence:{confidence:"SOLID"|"DIRECTIONAL"|"NOISE", text:string}}], watchlist:[{item:string, why:string}]}. ' +
  'pesoImpact is a plain PESO number (e.g. 5000 means ₱5,000/week), NOT centavos — do not multiply by 100. watchlist entries are things you are not confident enough to call a problem yet, or that are below the severity floor — always at least 1 entry, even when problems is non-empty.';

/** Pass 4's output contract — the same fields runCouncilSession's schema
 *  describes MINUS problems/watchlist (those are already finalized by
 *  Pass 3 and get attached by code after Pass 4 responds), reusing the
 *  exact prediction/kill_switch object-shape warning verbatim (the
 *  documented fix for the 2nd live dry run's sanitize() crash). */
const STAGE4_OUTPUT_SCHEMA =
  'output_schema (problems/watchlist are NOT part of this response — they are already finalized from Stage 3 and attached automatically after you respond; do not emit them): {snapshot:string[], floor:[{expert,read,diagnosis,action,prediction:{text,metric,threshold,target_id,deadline_days},confidence}] (exactly 4 — one per CHARLEY,NICK,BEN,DARA), cross_examination:string[] (>=2 entries), disagreement:string, diagnosis:{root_cause:string, lever:"audience"|"creative"|"offer"|"fatigue"|"mixed"|"healthy", evidence:string}, action_plan:[{step:string, because:string, lever:string}] (2-4 ordered steps, biggest lever first; [] is fine on a healthy week), creative_ideas:[{concept:string, angle:string, persona:string, hook:string, why:string}] (2-3 net-new creative concepts, grounded in winningCreatives + the untested tag/persona whitespace), solutions:[{problem:string, fix:string, lever:string, expectedEffect:string}] (§0b Stage 4 — one concrete, structure-aware fix per finalized_problems entry; "problem" must match that entry\'s description), synthesis:string (§0b Stage 5 — one cohesive briefing paragraph ranked by business impact; on a healthy week, plainly say "nothing needs fixing this week" per the NULL-RESULT LAW), verdict:{action,why_it_wins,what_it_costs,kill_switch:{text,metric,threshold,target_id,deadline_days},dissent_on_record,also_cleared:string[]}, transcript_md:string}. ' +
  '"prediction" and "kill_switch" are OBJECTS, not strings — every one of their 5 fields (text, metric, threshold, target_id, deadline_days) is REQUIRED and must never be omitted, even when metric is "" (non-machine-checkable): text/metric are always strings ("" allowed), threshold/target_id are number|null / string|null, deadline_days is an integer.';

/** Data-mode preamble shared by every staged pass — same note
 *  runCouncilSession's system opens with. */
function stageDataModeNote(pack: CouncilPack): string {
  return `Data mode: ${pack.dataMode}. ${pack.dataMode === 'A' ? 'DEGRADED MODE — reversible verdicts only, confidence capped Medium.' : ''}`;
}

/** Pass 1 system — Stage 1 (find & classify ALL problems, malfunction-first).
 *  Rule set: everything EXCEPT CREATIVE_IDEAS_RULE (no creative briefing at
 *  this stage) and UNIT_CONVENTIONS (that rule is entirely about the
 *  prediction/kill_switch objects, which only Pass 4 emits). */
function stage1System(pack: CouncilPack): string {
  return `STAGED COUNCIL — PASS 1 of 4 (Stage 1: find & classify ALL problems). ${stageDataModeNote(pack)}\n` +
    `${PERSONA_RULE}\n${METHOD_RULE}\n${PROFIT_ANCHOR_RULE}\n${SCOPE_RULE}\n${OUTPUT_DISCIPLINE_RULE}\n${DIAGNOSTIC_SPINE}\n${CREATIVE_METRICS_RULE}\n${MOVEMENT_LEARNING_RULE}\n${MEMORY_RULE}\n${STRUCTURE_RULE}\n` +
    'THIS PASS = STAGE 1 ONLY: the divergent braindump. Find every problem visible across the account this week and classify each by type (malfunction/creative/fatigue/audience/offer/setup/algorithm/market). MALFUNCTION-FIRST: pack.malfunctions is a deterministic pre-check — convert EVERY entry in it into a problem with type="malfunction" first (size its pesoImpact and evidence.text from the malfunction\'s own detail plus this week\'s numbers), THEN continue braindumping the other 7 types across the rest of the account. The user message also carries severity_floor_pesos (this week\'s ~5% severity floor, already converted to pesos) — use it as a first guess for problems vs watchlist, but do not agonize over the boundary: a later pass cross-examines and re-buckets everything, so lean divergent and inclusive here rather than pre-filtering. Do NOT propose solutions and do NOT write a verdict yet — those are later passes. ' +
    'Respond with ONLY a JSON object matching output_schema in the user message.';
}

/** Pass 2 system — cross-examine Pass 1's problems, then Stage 2 (pick
 *  which data/metric matters per surviving problem). No MEMORY_RULE (this
 *  pass prunes THIS week's problems, it does not grade past plans). */
function stage2System(pack: CouncilPack): string {
  return `STAGED COUNCIL — PASS 2 of 4 (cross-examine Pass 1, then Stage 2: pick the data). ${stageDataModeNote(pack)}\n` +
    `${PERSONA_RULE}\n${METHOD_RULE}\n${PROFIT_ANCHOR_RULE}\n${SCOPE_RULE}\n${OUTPUT_DISCIPLINE_RULE}\n${DIAGNOSTIC_SPINE}\n${CREATIVE_METRICS_RULE}\n${MOVEMENT_LEARNING_RULE}\n${STRUCTURE_RULE}\n` +
    'THIS PASS = cross-examine stage1_output (in the user message) as a skeptical second reader, THEN do STAGE 2. For every problem Pass 1 found, challenge it: is the type right, is pesoImpact realistic, is evidence.confidence honestly derived? PRUNE: a problem survives into your "problems" output ONLY if pesoImpact >= severity_floor_pesos AND evidence.confidence is NOT "NOISE" — EXCEPT type="malfunction" problems, which are EXEMPT from both checks (a broken pixel or disapproved ad is worth fixing regardless of its current dollar size, and you often cannot even measure its true impact while it is broken — never demote a real malfunction for being "small"). Anything that does not survive goes into "watchlist" instead — merge with Pass 1\'s own watchlist, do not drop entries. Cross-check pack.malfunctions against the survivors too: if any malfunction is not represented, add it now as a malfunction problem (Pass 1 may have missed it). For every SURVIVING problem, do STAGE 2: append to its evidence.text which diagnostic metric(s) it should be judged against (creative→link-CTR/hook, fatigue→CTR-trend+frequency, audience→CPM/placement/demo, offer→CVR/funnel, setup→structure/optimization, malfunction→status/metric-cliff, market→cross-account CPM/CPP simultaneity), so the next pass knows exactly where to gather evidence. Do NOT propose solutions and do NOT write a verdict yet. ' +
    'Respond with ONLY a JSON object matching output_schema in the user message.';
}

/** Pass 3 system — Stage 3 (find the specific evidence for each surviving
 *  problem). Same rule set as Pass 2 (evidence-gathering needs the same
 *  metric-layer rules to know where to look). */
function stage3System(pack: CouncilPack): string {
  return `STAGED COUNCIL — PASS 3 of 4 (Stage 3: find the evidence). ${stageDataModeNote(pack)}\n` +
    `${PERSONA_RULE}\n${METHOD_RULE}\n${PROFIT_ANCHOR_RULE}\n${SCOPE_RULE}\n${OUTPUT_DISCIPLINE_RULE}\n${DIAGNOSTIC_SPINE}\n${CREATIVE_METRICS_RULE}\n${MOVEMENT_LEARNING_RULE}\n${STRUCTURE_RULE}\n` +
    'THIS PASS = STAGE 3 ONLY, on stage2_output\'s survivors (in the user message). For each problem, REPLACE its evidence.text with the SPECIFIC proof: real numbers, the exact ad/placement/segment/day, using the diagnostic metric(s) Stage 2 named — not vibes. Use pack.thisWeek.ads[].confidence for the relevant ad(s) to finalize each problem\'s evidence.confidence (MINIMUM-SIGNAL RULE: SOLID >= ~10 purchases or spend >= ~3x blended CPA, DIRECTIONAL >= 3 purchases or spend >= ~1x blended CPA, else NOISE; day-of-week context is capped at DIRECTIONAL). If gathering real evidence shows a problem is weaker than Pass 1/2 thought — confidence actually NOISE, or the real pesoImpact actually below severity_floor_pesos — demote it to watchlist now rather than carrying it forward on stale confidence (malfunction-type problems stay exempt from the floor, per Pass 2\'s rule). Do not invent brand-new problem types at this stage (that was Stage 1\'s job), though you may still add a malfunction problem if pack.malfunctions surfaces one the prior passes missed. Do NOT propose solutions and do NOT write a verdict yet — that is the next (final) pass. ' +
    'Respond with ONLY a JSON object matching output_schema in the user message.';
}

/** Pass 4 system — Stages 4-5 (solutions, synthesis, the full floor debate,
 *  the Chair's verdict). The one staged pass that needs doctrine's own text
 *  (the 4 named experts, the Conflict Map, the Decision Rubric, banned
 *  phrases, §5's output shape) — mirrors runCouncilSession's system build
 *  closely, since this pass IS effectively that same call, just handed
 *  already-finalized problems instead of having to find them itself. */
function stage4System(pack: CouncilPack, doctrine: string): string {
  return `${doctrine}\n\n=== RUNTIME RULES ===\n` +
    `STAGED COUNCIL — PASS 4 of 4 (Stages 4-5: solutions, synthesis, the floor debate, the verdict). You are the full council + Chair. ${stageDataModeNote(pack)}\n` +
    `${PERSONA_RULE}\n${METHOD_RULE}\n${PROFIT_ANCHOR_RULE}\n${SCOPE_RULE}\n${OUTPUT_DISCIPLINE_RULE}\n` +
    'Obey doctrine §5 output shape. Banned phrases: "monitor closely", "consider testing", "keep an eye on".\n' +
    'The verdict.action field is read by a non-technical business owner on their phone: write it as ONE plain-English imperative sentence naming the ad and the move (e.g. "Turn off the ad \'X\' — it keeps showing to the same people without selling"). Say "turn off" or "pause", never "kill". No section references (§...), no jargon like "CPP", "frequency", "spend share", "fatigue definition" — put all that reasoning in transcript_md, never in action. NEVER recommend turning off an ad that is still producing sales at a reasonable cost in its most recent days — a rising cost on a small-budget ad is a "watch", not a cut.\n' +
    'Each ad now carries a "creative" object (creativeTag/format/angle/persona/awarenessLevel/hook/visualQuality/onBrand/tags) describing WHAT the creative is. creativeTag is the headline label from a fixed vocabulary: Testimonial, Talking Head, Walkthrough, Problem-Based, Income Claim, Objection, Urgency, Graphic, Other. Reason about creative STRATEGY, not just numbers. creative may be null for not-yet-analyzed ads — treat that as "unknown", not a negative signal.\n' +
    `${DIAGNOSTIC_SPINE}\n${CREATIVE_METRICS_RULE}\n${MEMORY_RULE}\n${STRUCTURE_RULE}\n${MOVEMENT_LEARNING_RULE}\n${CREATIVE_IDEAS_RULE}\n${UNIT_CONVENTIONS}\n` +
    'THIS PASS = STAGES 4-5 ONLY. finalized_problems and finalized_watchlist (in the user message) are ALREADY found, cross-examined, and evidenced by Stages 1-3 in the prior 3 passes — do NOT re-derive, add, drop, or renumber them, and do NOT emit "problems"/"watchlist" fields yourself (they are attached automatically after your response). Ground everything below in finalized_problems: cite their pesoImpact/evidence.text, never invent new numbers. STAGE 4: emit "solutions" — one concrete, structure-aware, earn-more-or-spend-less fix per finalized problem (a market/auction hold, or a pure watch item, may legitimately have none). STAGE 5: synthesize everything — the full floor debate (CHARLEY/NICK/BEN/DARA + cross-examination + disagreement per the Conflict Map), "diagnosis" (root cause + lever + evidence), "action_plan", "creative_ideas", "synthesis" (one cohesive briefing paragraph ranked by business impact), and the Chair\'s "verdict". If finalized_problems is empty, this is a healthy-week write-up per the NULL-RESULT LAW: say so plainly in synthesis and verdict.action, and floor/action_plan/solutions may legitimately be sparse or near-empty — do not manufacture debate just to fill the format.\n' +
    'Respond with ONLY a JSON object matching output_schema in the user message — transcript_md holds the human-readable §5-format transcript.';
}

/** Runs one of the three problem-shaped passes (Stage 1/2/3) end to end:
 *  call Claude, extract + validate the JSON. Never throws — a transport
 *  error, a truncated response, or a non-object body all degrade to
 *  `fallback` (the PRIOR stage's problems/watchlist, unchanged) plus one
 *  watchlist entry naming the failure, so one pass's hiccup never erases
 *  earlier passes' real work. For Pass 1 specifically, fallback is
 *  {problems:[], watchlist:[]} (there is no prior stage), which is exactly
 *  what feeds the cost guard toward a null-result if pack.malfunctions is
 *  also empty. */
async function runProblemStage(
  key: string, model: string, system: string, user: string, label: string, fallback: StageProblems,
): Promise<StageProblems & { usage: TokenUsage | null }> {
  try {
    const { text, usage, stopReason } = await callClaude(key, model, system, user);
    let result: StageProblems;
    try {
      result = validateStageProblems(JSON.parse(extractJson(text)));
    } catch (err) {
      throw new Error(`${errMsg(err)}. stop_reason=${stopReason ?? 'unknown'}. Raw text (first 300 chars): ${text.slice(0, 300)}`);
    }
    return { ...result, usage };
  } catch (err) {
    const msg = errMsg(err).replace(/\s+/g, ' ').slice(0, 300);
    console.error(`[runStagedCouncil] ${label} failed, carrying the prior stage forward unchanged: ${msg}`);
    return {
      problems: fallback.problems,
      watchlist: [...fallback.watchlist, { item: `${label} failed this run — its output was skipped.`, why: msg }],
      usage: null,
    };
  }
}

/** Runs Pass 4 (Stages 4-5). Reuses validateSessionJson AS its validator —
 *  task-sanctioned ("reuse ... validateSessionJson ... so a malformed pass
 *  never throws"): Pass 4's own JSON is deliberately missing
 *  problems/watchlist (the caller attaches Stage 3's finalized versions
 *  after), which validateSessionJson already tolerates by defaulting them
 *  to []. On total failure (transport error, truncated JSON, or a response
 *  missing verdict/floor — validateSessionJson's own "UNSALVAGEABLE"
 *  throw), degrades to a SessionJson shell that says so in plain language
 *  rather than losing the whole (paid, 3-pass) run; the caller still
 *  attaches Stage 3's real problems/watchlist to this shell regardless. */
async function runSynthesisStage(
  key: string, model: string, system: string, user: string,
): Promise<{ session: SessionJson; usage: TokenUsage | null }> {
  try {
    const { text, usage, stopReason } = await callClaude(key, model, system, user);
    let session: SessionJson;
    try {
      session = validateSessionJson(JSON.parse(extractJson(text)));
    } catch (err) {
      throw new Error(`${errMsg(err)}. stop_reason=${stopReason ?? 'unknown'}. Raw text (first 300 chars): ${text.slice(0, 300)}`);
    }
    return { session, usage };
  } catch (err) {
    const msg = errMsg(err).replace(/\s+/g, ' ').slice(0, 300);
    console.error(`[runStagedCouncil] Pass 4 (Stages 4-5) failed: ${msg}`);
    return {
      session: {
        snapshot: [], floor: [], cross_examination: [], disagreement: '',
        diagnosis: { root_cause: '', lever: '', evidence: '' },
        action_plan: [], creative_ideas: [],
        problems: [], solutions: [],
        synthesis: `Synthesis (Stages 4-5) failed this run: ${msg}. Problems and evidence found in Stages 1-3 are still recorded below; re-run the weekly council to get solutions/verdict.`,
        watchlist: [],
        verdict: {
          action: 'Synthesis failed this run — no verdict was generated. Problems/evidence from Stages 1-3 were still captured; re-run the weekly council.',
          why_it_wins: '', what_it_costs: '',
          kill_switch: defaultPrediction(),
          dissent_on_record: '', also_cleared: [],
        },
        transcript_md: `Synthesis pass (Stages 4-5) failed: ${msg}`,
      },
      usage: null,
    };
  }
}

/** The COST GUARD's deterministic short-circuit (spec §0b + plan Step 2):
 *  built entirely in code, no LLM call — when Pass 1 already shows nothing
 *  worth the other 3 passes, this saves ~3/4 of the run's tokens and
 *  honors the NULL-RESULT LAW ("a healthy account is a valid finding").
 *  Below-floor problems Pass 1 still found are folded into watchlist
 *  rather than silently dropped. */
function nullResultSession(pack: CouncilPack, stage1: StageProblems, floorPesos: number): SessionJson {
  const watchlist: SessionJson['watchlist'] = [...stage1.watchlist];
  for (const p of stage1.problems) {
    watchlist.push({
      item: p.description,
      why: p.evidence.text || `Estimated impact ~₱${Math.round(p.pesoImpact).toLocaleString()}/week — below this week\'s ~5% severity floor (~₱${Math.round(floorPesos).toLocaleString()}/week).`,
    });
  }
  if (watchlist.length === 0) {
    watchlist.push({
      item: 'No signal crossed the severity floor this week — recheck next week for anything that does.',
      why: `Weekly spend was ~₱${Math.round(pack.thisWeek.campaign.spend / 100).toLocaleString()}; nothing moved enough of that to act on.`,
    });
  }
  const roas = pack.thisWeek.campaign.roas;
  const roasNote = roas != null ? `Blended ROAS ${roas.toFixed(2)}x this week.` : 'ROAS unavailable this week (no purchases yet).';
  return {
    snapshot: [`Nothing crossed the severity floor this week. ${roasNote}`],
    floor: [], cross_examination: [], disagreement: '',
    diagnosis: {
      root_cause: 'No problem this week reached the severity floor or a known malfunction — the account is healthy.',
      lever: 'healthy',
      evidence: `Weekly spend ₱${Math.round(pack.thisWeek.campaign.spend / 100).toLocaleString()}. ${roasNote}`,
    },
    action_plan: [], creative_ideas: [],
    problems: [], solutions: [],
    synthesis: 'Nothing needs fixing this week — the account is healthy. See the watch item(s) below for what to keep an eye on.',
    watchlist,
    verdict: {
      action: 'No action needed this week — hold the current course.',
      why_it_wins: 'No above-floor problem or known malfunction was found this week; the safest and highest-EV move is not touching a healthy account.',
      what_it_costs: '',
      kill_switch: defaultPrediction(),
      dissent_on_record: '', also_cleared: [],
    },
    transcript_md: `=== BOSSLABS ADS COUNCIL — STAGED (NULL-RESULT) — ${pack.brand} ===\nNothing needs fixing this week. ${roasNote}\nWatch: ${watchlist.map((w) => w.item).join('; ')}`,
  };
}

/** Inserts one council_sessions row + one council_predictions row per floor
 *  expert prediction + the Chair's kill switch. Logic-identical to
 *  runCouncilSession's own persistence tail — copied out (not imported
 *  back into it) so runCouncilSession's body is not touched at all. */
async function persistSession(
  brand: Brand, triggerReasons: string[], pack: CouncilPack, parsed: SessionJson,
  model: string, usage: TokenUsage | null,
): Promise<{ sessionId: string; failedPredictionInserts: number }> {
  const sb = getSupabase();
  const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
  const { data, error } = await sb.from('council_sessions').insert({
    date: today, brand, trigger_reasons: triggerReasons, data_mode: pack.dataMode,
    transcript_md: parsed.transcript_md,
    verdict: { ...parsed.verdict, diagnosis: parsed.diagnosis, action_plan: parsed.action_plan, creative_ideas: parsed.creative_ideas,
      problems: parsed.problems, solutions: parsed.solutions, synthesis: parsed.synthesis, watchlist: parsed.watchlist },
    model,
    input_tokens: usage?.input_tokens ?? null, output_tokens: usage?.output_tokens ?? null,
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
      console.error(`[runStagedCouncil] council_predictions insert failed for ${expert}: ${predError.message}`);
      failedPredictionInserts++;
    }
  }
  return { sessionId, failedPredictionInserts };
}

/** The weekly staged council (spec §0b "Staged council (Hybrid — decided)").
 *  4 sequential Messages API calls — Pass 1 (Stage 1: find + classify every
 *  problem, malfunction-first) → COST GUARD → Pass 2 (cross-examine Pass 1,
 *  Stage 2: pick the data) → Pass 3 (Stage 3: evidence) → Pass 4 (Stages
 *  4-5: solutions + synthesis + the floor debate + the Chair's verdict) —
 *  where each call's user message carries the pack PLUS the prior pass's
 *  validated JSON, so the council genuinely cross-examines itself instead
 *  of reasoning once. Returns and persists exactly like runCouncilSession
 *  (same `{sessionId, failedPredictionInserts}` shape, same
 *  council_sessions + council_predictions inserts) — callers (the weekly
 *  pipeline, once wired) can treat the two functions interchangeably.
 *  `runCouncilSession` itself is untouched; this is purely additive. */
export async function runStagedCouncil(
  brand: Brand,
  triggerReasons: string[],
  opts: { model?: string } = {},
): Promise<{ sessionId: string; failedPredictionInserts: number }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');
  const model = opts.model || WEEKLY_MODEL;
  const pack = await assemblePack(brand, settledDay());
  const floorPesos = severityFloorPesos(pack);

  // ---- Pass 1 — Stage 1: braindump + classify, malfunction-first ----
  const stage1 = await runProblemStage(
    key, model, stage1System(pack),
    JSON.stringify({ trigger_reasons: triggerReasons, pack, severity_floor_pesos: floorPesos, output_schema: STAGE_PROBLEMS_SCHEMA }),
    'Pass 1 (Stage 1 — find & classify)',
    { problems: [], watchlist: [] },
  );
  let usage = stage1.usage;

  // ---- COST GUARD (spec §0b + plan Step 2) — skip Passes 2-4 when there is
  // genuinely nothing to cross-examine: no deterministic malfunction AND no
  // problem clears the severity floor. Saves ~3/4 of the run's tokens and
  // is the code-level enforcement of the NULL-RESULT LAW. ----
  const aboveFloor = stage1.problems.filter((p) => p.pesoImpact >= floorPesos);
  if (pack.malfunctions.length === 0 && aboveFloor.length === 0) {
    const session = nullResultSession(pack, stage1, floorPesos);
    sanitize(session);
    return persistSession(brand, triggerReasons, pack, session, model, usage);
  }

  // ---- Pass 2 — cross-examine Pass 1 + Stage 2: pick the data ----
  const stage2 = await runProblemStage(
    key, model, stage2System(pack),
    JSON.stringify({ pack, severity_floor_pesos: floorPesos, stage1_output: { problems: stage1.problems, watchlist: stage1.watchlist }, output_schema: STAGE_PROBLEMS_SCHEMA }),
    'Pass 2 (cross-exam + Stage 2 — pick data)',
    { problems: stage1.problems, watchlist: stage1.watchlist },
  );
  usage = addUsage(usage, stage2.usage);

  // ---- Pass 3 — Stage 3: gather the evidence ----
  const stage3 = await runProblemStage(
    key, model, stage3System(pack),
    JSON.stringify({ pack, severity_floor_pesos: floorPesos, stage2_output: { problems: stage2.problems, watchlist: stage2.watchlist }, output_schema: STAGE_PROBLEMS_SCHEMA }),
    'Pass 3 (Stage 3 — evidence)',
    { problems: stage2.problems, watchlist: stage2.watchlist },
  );
  usage = addUsage(usage, stage3.usage);

  // ---- Pass 4 — Stages 4-5: solutions + synthesis + floor debate + verdict ----
  const doctrine = readFileSync(path.join(process.cwd(), 'docs/ads-council/DOCTRINE.md'), 'utf8');
  const stage4 = await runSynthesisStage(
    key, model, stage4System(pack, doctrine),
    JSON.stringify({
      trigger_reasons: triggerReasons, pack,
      finalized_problems: stage3.problems, finalized_watchlist: stage3.watchlist,
      output_schema: STAGE4_OUTPUT_SCHEMA,
    }),
  );
  usage = addUsage(usage, stage4.usage);

  // ---- Assemble the FULL SessionJson from all passes ----
  const finalSession: SessionJson = { ...stage4.session, problems: stage3.problems, watchlist: stage3.watchlist };
  if (finalSession.watchlist.length === 0) {
    finalSession.watchlist.push({
      item: 'No specific watch item was named this run.',
      why: 'Fallback — Pass 4 did not populate one and Stage 3 carried none forward.',
    });
  }
  sanitize(finalSession);

  return persistSession(brand, triggerReasons, pack, finalSession, model, usage);
}
