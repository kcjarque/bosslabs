/** Ads Council executor — the ONLY place in this codebase that writes to a
 *  live Meta ad account on the council's behalf (pause/unpause an ad, set a
 *  campaign's daily budget). Two pure guardrails (`checkPauseGuardrail`,
 *  `clampBudget`) are enforced here IN CODE, unconditionally, regardless of
 *  which mode (`recommend` | `one_click` | `autopilot`) is active — the
 *  council's LLM output is advisory only; this file is the one place that
 *  can actually move money on a live account spending ~₱16k/day, so the
 *  guardrails are not a UI nicety, they are the product:
 *    - never pause a LEARNING-tier ad (Ground Truth §1).
 *    - never let one day's pausing remove more than 20% of the campaign's
 *      trailing-7d DAILY-AVERAGE spend (doctrine's 20%-of-daily-spend cap,
 *      accumulated across every pause already executed today, net of any
 *      same-day unpause of the same ad).
 *    - never move a campaign's daily budget by more than ±20% in one call.
 *  `executeAction` logs every attempt — refused, failed, or successful — to
 *  `council_actions` (before/after jsonb + a `result` string the UI
 *  surfaces), EXCEPT in `recommend` mode, which is a pure no-op: no Meta
 *  call, no log row, checked first before anything else runs. */
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { getAdSeries, getLatestVerdicts } from './db';
import { windowsFor } from './verdict-engine';
import { settledDay } from './session';
import type { AdSeries, Brand, Mode, Tier, VerdictResult } from './types';

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v23.0';

/** Manila calendar "today" — same "+8h then slice UTC date" convention as
 *  session.ts's `today` / pipeline.ts's private `manilaToday` (neither is
 *  exported, so replicated here rather than imported — matches this
 *  codebase's established 1-liner-duplication convention for date
 *  helpers). `council_actions.date` is a real-time "when was this action
 *  taken" stamp, not a settled-window metric, so it uses calendar-today
 *  (like council_sessions), not settledDay(). */
function manilaToday(): string {
  return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
}

const peso = (c: number) => `₱${Math.round(c / 100).toLocaleString()}`;

/** Doctrine's 20%-of-daily-spend pause cap, in DAILY-AVERAGE terms: refuses
 *  when this ad's trailing-7d spend, averaged to a per-day figure, PLUS
 *  everything already paused today, would exceed 20% of the whole
 *  campaign's trailing-7d spend (also averaged to a per-day figure). Pure —
 *  every input is a value the caller already fetched, so this can run
 *  against many candidate ads without re-querying anything.
 *
 *  `adSpend7ByAd` is expected to cover EVERY ad in the campaign (not just
 *  the candidate) — its sum is how the campaign-wide daily average is
 *  derived. Missing data is handled ASYMMETRICALLY, deliberately: another
 *  ad missing from the map just drops out of the sum, understating the
 *  campaign total — the cap comes out too LOW, so this over-refuses,
 *  which is the safe direction to fail in. But the TARGET ad's own entry
 *  missing is the opposite hazard: silently treating unknown as ₱0 would
 *  UNDERSTATE wouldRemove and could let an over-cap pause through blind.
 *  So a missing target-ad entry is a hard refusal below, never a `?? 0`
 *  fallback — "no data" must never be conflated with "no spend". */
export function checkPauseGuardrail(args: {
  adSpend7ByAd: Record<string, number>;
  alreadyPausedTodayCentavos: number;
  adId: string;
  tier: Tier;
}): { ok: boolean; reason?: string } {
  // Ground Truth: LEARNING ads never get touched, full stop — no spend math
  // even applies here.
  if (args.tier === 'LEARNING') {
    return { ok: false, reason: 'never touch learning ads' };
  }
  // Missing spend data for the TARGET ad is not the same as ₱0 spend (see
  // the asymmetry note above) — refuse rather than guess blind.
  if (!(args.adId in args.adSpend7ByAd)) {
    return { ok: false, reason: 'no spend data for this ad — refusing to pause blind' };
  }

  const adDailyAvg = args.adSpend7ByAd[args.adId] / 7;
  const campaignSpend7 = Object.values(args.adSpend7ByAd).reduce((a, b) => a + b, 0);
  const campaignDailyAvg = campaignSpend7 / 7;
  const cap = campaignDailyAvg * 0.2;
  // A campaign with zero trailing spend yields cap=0 — any nonzero removal
  // (this ad's own average, or spend already pulled by an earlier pause
  // today) correctly refuses rather than dividing into a false pass.
  const wouldRemove = adDailyAvg + args.alreadyPausedTodayCentavos;

  if (wouldRemove > cap) {
    return {
      ok: false,
      reason: `pausing would remove ${peso(wouldRemove)}/day, cap is ${peso(cap)}/day (20%)`,
    };
  }
  return { ok: true };
}

/** Clamps a requested campaign daily-budget change to ±20% of the current
 *  value — doctrine's budget-change cap, enforced unconditionally (this is
 *  a silent clamp, not a refusal: there is no "budget change refused"
 *  outcome, only "the change that actually happens may be smaller than
 *  requested"). Boundary-inclusive: a request of exactly ±20% passes
 *  through unclamped. Rounds the band edges to whole centavos — `daily_
 *  budget` is a Meta minor-unit integer, and `currentCentavos` isn't
 *  guaranteed to be a multiple of 5. */
export function clampBudget(currentCentavos: number, requestedCentavos: number): number {
  const min = Math.round(currentCentavos * 0.8);
  const max = Math.round(currentCentavos * 1.2);
  return Math.min(max, Math.max(min, requestedCentavos));
}

/** Nets today's pause contributions against today's unpause credits, per ad
 *  id, for `checkPauseGuardrail`'s `alreadyPausedTodayCentavos` accumulator.
 *  An ad successfully unpaused today no longer has any of its spend
 *  "removed" today, regardless of an earlier same-day pause — rather than
 *  reconstruct a subtraction amount the unpause row never recorded (see
 *  `executeUnpause`'s empty `before`), this nets that ad's pause
 *  contribution to zero outright. Pure — the Supabase-backed caller
 *  (`sumAlreadyPausedTodayCentavos`) just fetches+maps rows into this
 *  shape, so the netting logic itself is directly unit-testable. Floors
 *  at 0 defensively: the exclusion-based netting below can't actually go
 *  negative, but the floor documents that invariant explicitly rather
 *  than leaving it implicit in the algorithm. */
export function netPausedTodayCentavos(
  rows: Array<{ actionType: 'pause_ad' | 'unpause_ad'; targetId: string; spend7DailyAvg: number }>,
): number {
  const unpausedToday = new Set(
    rows.filter((r) => r.actionType === 'unpause_ad').map((r) => r.targetId),
  );
  const total = rows
    .filter((r) => r.actionType === 'pause_ad' && !unpausedToday.has(r.targetId))
    .reduce((sum, r) => sum + r.spend7DailyAvg, 0);
  return Math.max(0, total);
}

/* --------------------------------------------------------------------- */
/* Meta Graph write + council_actions logging                            */
/* --------------------------------------------------------------------- */

type ActionArgs = {
  brand: Brand; sessionId: string | null;
  type: 'pause_ad' | 'unpause_ad' | 'set_budget';
  targetId: string; requestedBudgetCentavos?: number;
  mode: Mode; executedBy: string;
};

/** POSTs `/{id}?...params&access_token=...` — the write-side counterpart of
 *  lib/meta-ads.ts's `graph()` GET helper (same URL shape, same env var,
 *  method flipped to POST). Never throws: every failure — missing token,
 *  network error, or a Graph-returned `error` object (this is exactly how
 *  a read-scope-only token surfaces: an OAuthException on the POST, not an
 *  HTTP-level rejection) — comes back as `{ ok: false, error }` so the
 *  caller can log and return it as the action's `result` untouched. */
async function graphPost(id: string, params: Record<string, string>): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.META_ADS_TOKEN;
  if (!token) return { ok: false, error: 'META_ADS_TOKEN not configured' };
  const qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${id}?${qs}&access_token=${encodeURIComponent(token)}`;
  try {
    const res = await fetch(url, { method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(12_000) });
    const json = (await res.json()) as { success?: boolean; error?: { message?: string; code?: number } };
    if (json.error) {
      return { ok: false, error: `Meta: ${json.error.message ?? 'unknown error'} (code ${json.error.code ?? '?'})` };
    }
    // Some Marketing API mutation endpoints return {"success": false} with
    // no structured error object on a logical failure — an explicit false
    // is a real "it didn't work" signal, not to be confused with the field
    // simply being absent (undefined), which falls through to the ok:true
    // default below like every other successful response shape already
    // observed from these endpoints.
    if (json.success === false) {
      return { ok: false, error: 'Meta returned success:false with no error detail' };
    }
    if (!res.ok) return { ok: false, error: `Meta HTTP ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Meta request failed' };
  }
}

/** Best-effort read of a campaign's own `daily_budget` (centavos) — the
 *  "current" side of a `set_budget` clamp. Reuses `lib/meta-ads.ts`'s
 *  `getCampaignBudget()` fetch pattern (same field, same env var) but
 *  parameterized on an arbitrary campaign id rather than that function's
 *  hardcoded single tracked campaign, and without its ABO ad-set-sum
 *  fallback — that fallback exists purely for dashboard REPORTING accuracy
 *  when a campaign has no CBO budget at all, which isn't a state
 *  `set_budget` (campaign-level, by design) can sensibly act on anyway.
 *  Any failure -> 0, matching getCampaignBudget's degrade-to-null
 *  convention (the caller treats <=0 as "couldn't read, don't clamp
 *  against garbage" rather than silently clamping to a zero budget). */
async function getCurrentBudgetCentavos(campaignId: string): Promise<number> {
  const token = process.env.META_ADS_TOKEN;
  if (!token) return 0;
  try {
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${campaignId}` +
      `?fields=daily_budget&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(12_000) });
    const json = (await res.json()) as { daily_budget?: string; error?: { message?: string } };
    return json.daily_budget ? Number(json.daily_budget) : 0;
  } catch {
    return 0;
  }
}

/** Sum of `before.spend7DailyAvg` across every successful pause already
 *  logged today (brand + Manila-today + action_type='pause_ad' +
 *  result='ok'), net of any same-day successful unpause of that same ad
 *  (see `netPausedTodayCentavos`) — the running total
 *  `checkPauseGuardrail`'s `alreadyPausedTodayCentavos` needs to keep the
 *  20% cap honest across MULTIPLE pauses (and pause/unpause reversals) in
 *  the same day, not just per-call. `spend7DailyAvg` is a field this
 *  module defines and writes (see `executePause`'s `before` payload
 *  below) — no other writer touches `council_actions`. */
async function sumAlreadyPausedTodayCentavos(brand: Brand): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  const { data, error } = await getSupabase()
    .from('council_actions')
    .select('action_type, target_id, before')
    .eq('brand', brand)
    .eq('date', manilaToday())
    .in('action_type', ['pause_ad', 'unpause_ad'])
    .eq('result', 'ok');
  if (error) throw new Error(`sumAlreadyPausedTodayCentavos: ${error.message}`);
  const rows = (data as {
    action_type: 'pause_ad' | 'unpause_ad'; target_id: string; before: { spend7DailyAvg?: number };
  }[]) ?? [];
  return netPausedTodayCentavos(rows.map((r) => ({
    actionType: r.action_type, targetId: r.target_id, spend7DailyAvg: r.before?.spend7DailyAvg ?? 0,
  })));
}

/** Writes one `council_actions` row. Best-effort: this runs AFTER the real
 *  Meta call (or refusal) already happened, so a logging failure must never
 *  mask the true ok/result the caller already computed — console.error and
 *  move on, same "insert failure -> log, don't throw" precedent as
 *  session.ts's per-prediction insert loop. `isSupabaseConfigured()`-gated
 *  like every other write in lib/council/db.ts. */
async function logAction(row: {
  a: ActionArgs; before: Record<string, unknown>; after: Record<string, unknown>; result: string;
}): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const { a, before, after, result } = row;
  const { error } = await getSupabase().from('council_actions').insert({
    date: manilaToday(), brand: a.brand, session_id: a.sessionId,
    action_type: a.type, target_id: a.targetId,
    before, after, mode: a.mode, executed_by: a.executedBy, result,
  });
  if (error) console.error(`[executor] council_actions insert failed: ${error.message}`);
}

async function executePause(a: ActionArgs): Promise<{ ok: boolean; result: string }> {
  const asOf = settledDay();
  // Every call here throws on a real Supabase error (getAdSeries,
  // getLatestVerdicts, sumAlreadyPausedTodayCentavos all follow this
  // codebase's db.ts convention). Uncaught, that would reject
  // executeAction itself — breaking both its documented never-rejects
  // contract and this file's own "every attempt is logged" promise, since
  // a thrown data-gathering step never reaches logAction below.
  let gathered: [AdSeries[], VerdictResult[], number];
  try {
    gathered = await Promise.all([
      getAdSeries(a.brand),
      getLatestVerdicts(a.brand),
      sumAlreadyPausedTodayCentavos(a.brand),
    ]);
  } catch (err) {
    const result = `error: ${err instanceof Error ? err.message : String(err)}`;
    await logAction({ a, before: {}, after: {}, result });
    return { ok: false, result };
  }
  const [series, verdicts, alreadyPausedTodayCentavos] = gathered;
  const adSpend7ByAd: Record<string, number> = {};
  for (const s of series) adSpend7ByAd[s.adId] = windowsFor(s, asOf).spend7;
  const tier: Tier = verdicts.find((v) => v.adId === a.targetId)?.verdict ?? 'LEARNING';
  const spend7DailyAvg = (adSpend7ByAd[a.targetId] ?? 0) / 7;
  const before = { tier, spend7DailyAvg };

  const guard = checkPauseGuardrail({ adSpend7ByAd, alreadyPausedTodayCentavos, adId: a.targetId, tier });
  if (!guard.ok) {
    const result = `refused: ${guard.reason}`;
    await logAction({ a, before, after: {}, result });
    return { ok: false, result };
  }

  const graphRes = await graphPost(a.targetId, { status: 'PAUSED' });
  const result = graphRes.ok ? 'ok' : (graphRes.error ?? 'unknown Meta error');
  await logAction({ a, before, after: { status: 'PAUSED' }, result });
  return { ok: graphRes.ok, result };
}

/** No guardrail: unpausing restores spend rather than removing it, so
 *  neither the LEARNING protection nor the 20%-cap (both exist specifically
 *  to bound how much daily spend the council can REMOVE) apply here. No
 *  tier/spend fetch either, for the same reason — nothing below needs it. */
async function executeUnpause(a: ActionArgs): Promise<{ ok: boolean; result: string }> {
  const graphRes = await graphPost(a.targetId, { status: 'ACTIVE' });
  const result = graphRes.ok ? 'ok' : (graphRes.error ?? 'unknown Meta error');
  await logAction({ a, before: {}, after: { status: 'ACTIVE' }, result });
  return { ok: graphRes.ok, result };
}

async function executeSetBudget(a: ActionArgs): Promise<{ ok: boolean; result: string }> {
  const requested = a.requestedBudgetCentavos;
  if (requested == null) {
    const result = 'set_budget requires requestedBudgetCentavos';
    await logAction({ a, before: {}, after: {}, result });
    return { ok: false, result };
  }

  // getCurrentBudgetCentavos already swallows its own fetch/parse errors
  // to 0 internally (matching getCampaignBudget's degrade-to-null
  // convention) — this try/catch is belt-and-suspenders so the safety
  // invariant ("this call site can never take executeAction down without
  // logging") holds locally, without depending on tribal knowledge of the
  // callee's internals surviving a future refactor.
  let current: number;
  try {
    current = await getCurrentBudgetCentavos(a.targetId);
  } catch (err) {
    const result = `error: ${err instanceof Error ? err.message : String(err)}`;
    await logAction({ a, before: {}, after: {}, result });
    return { ok: false, result };
  }
  if (!(current > 0)) {
    const result = 'refused: could not read current campaign budget from Meta';
    await logAction({ a, before: { currentCentavos: current }, after: {}, result });
    return { ok: false, result };
  }

  const clamped = clampBudget(current, requested);
  const before = { currentCentavos: current };
  const after = { requestedCentavos: requested, clampedCentavos: clamped };

  const graphRes = await graphPost(a.targetId, { daily_budget: String(clamped) });
  const result = graphRes.ok ? 'ok' : (graphRes.error ?? 'unknown Meta error');
  await logAction({ a, before, after, result });
  return { ok: graphRes.ok, result };
}

/** Mode-gated Meta write layer — the only function outside this file that
 *  should ever mutate a live ad's status or a campaign's budget. `mode`
 *  decides everything before any guardrail runs:
 *    - `recommend`: pure no-op, checked FIRST — no Meta call, no
 *      council_actions row. This is what makes 'recommend' mode actually
 *      safe: the guardrails below never even get a chance to run.
 *    - `one_click` / `autopilot`: guardrails run, then (on pass) the real
 *      Graph write. Every branch below — refused, Meta error, success —
 *      logs to `council_actions`; only the recommend-mode early return
 *      skips logging entirely. */
export async function executeAction(a: ActionArgs): Promise<{ ok: boolean; result: string }> {
  if (a.mode === 'recommend') {
    return { ok: false, result: 'recommend mode — execution disabled' };
  }
  if (a.type === 'pause_ad') return executePause(a);
  if (a.type === 'unpause_ad') return executeUnpause(a);
  return executeSetBudget(a);
}
