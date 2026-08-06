/** Ads Council prediction ledger — doctrine §6. `scoreOf`/`credibilityWeight`/
 *  `parseDirection` are pure. `resolveDuePredictions`/`getExpertWeights` read
 *  and write `council_predictions` directly via getSupabase() — no dedicated
 *  db.ts helper exists for this table yet, so these follow lib/council/db.ts's
 *  conventions in-file (snake_case rows, isSupabaseConfigured() guard
 *  returning safe defaults, throw on real Supabase errors).
 *  Machine-checkable metrics (cpp_7d / campaign_cpp_7d / spend_share_7d) grade
 *  automatically against settled ad_metrics_daily via getAdSeries+windowsFor;
 *  everything else is flagged needs_manual for the Council view's one-click
 *  HIT/MISS/PUSH (not built in this task). */
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { getAdSeries } from './db';
import { windowsFor } from './verdict-engine';
import type { AdSeries, Brand } from './types';

const MS_DAY = 86400000;
/** ISO date (YYYY-MM-DD) `days` before today — same convention as
 *  lib/council/db.ts's private `isoDaysAgo` (not exported there, so
 *  replicated here rather than imported). */
function isoDaysAgo(days: number): string {
  const todayMs = Date.parse(new Date().toISOString().slice(0, 10));
  return new Date(todayMs - days * MS_DAY).toISOString().slice(0, 10);
}

const EXPERTS = ['CHARLEY', 'NICK', 'BEN', 'DARA', 'CHAIR'] as const;
type Expert = (typeof EXPERTS)[number];

/** council_predictions row (snake_case) — column-for-column against
 *  supabase/migrations/0053_ads_council.sql. */
type PredictionRow = {
  id: string;
  date: string;
  brand: string;
  expert: string;
  session_id: string | null;
  conflict_ref: string | null;
  action_taken: boolean;
  prediction_text: string;
  metric: string;
  threshold: number | null;
  target_id: string | null;
  deadline: string;
  weight: number;
  outcome: string | null;
  needs_manual: boolean;
  resolved_date: string | null;
  notes: string;
};

/** +weight on hit, -weight on miss, 0 on push (doctrine §6 scoring). */
export function scoreOf(outcome: 'hit' | 'miss' | 'push', weight: number): number {
  if (outcome === 'hit') return weight;
  if (outcome === 'miss') return -weight;
  return 0;
}

/** Rolling credibility multiplier from a list of already-scored predictions:
 *  1 + sum(scores)*0.1, clamped [0.5, 2.0]. No history -> neutral 1.0. */
export function credibilityWeight(scores: number[]): number {
  if (scores.length === 0) return 1.0;
  const raw = 1 + scores.reduce((a, b) => a + b, 0) * 0.1;
  return Math.min(2.0, Math.max(0.5, raw));
}

const LTE_MARKERS = ['≤', '<', 'under', 'below', 'stay under'];
const GTE_MARKERS = ['≥', '>', 'over', 'above', 'exceed'];

/** Direction a prediction's free text is betting on — case-insensitive,
 *  since `prediction_text` is LLM-authored prose with no guaranteed casing.
 *  Neither marker present, or both (genuinely ambiguous), -> null; callers
 *  treat null as needs_manual rather than guess. */
export function parseDirection(text: string): 'lte' | 'gte' | null {
  const lower = text.toLowerCase();
  const hasLte = LTE_MARKERS.some((m) => lower.includes(m));
  const hasGte = GTE_MARKERS.some((m) => lower.includes(m));
  if (hasLte && !hasGte) return 'lte';
  if (hasGte && !hasLte) return 'gte';
  return null;
}

/** Machine-checkable actual value for one prediction row's metric, or null
 *  if it can't be resolved (unrecognized metric, missing target_id, or the
 *  target ad has no synced series for the settled window). */
function actualFor(
  row: PredictionRow,
  seriesByAdId: Map<string, AdSeries>,
  campaignSpend7: number,
  campaignCpp7: number | null,
  asOfSettled: string,
): number | null {
  if (row.metric === 'campaign_cpp_7d') return campaignCpp7;
  if (row.metric === 'cpp_7d' || row.metric === 'spend_share_7d') {
    if (!row.target_id) return null;
    const s = seriesByAdId.get(row.target_id);
    if (!s) return null;
    const w = windowsFor(s, asOfSettled);
    if (row.metric === 'cpp_7d') return w.cpp7;
    return campaignSpend7 > 0 ? w.spend7 / campaignSpend7 : null;
  }
  return null; // unrecognized metric string
}

/** Resolves every open (`outcome is null`, `needs_manual = false`) prediction
 *  for `brand` whose `deadline` has settled by `asOfSettled`. Machine-checkable
 *  metrics (`cpp_7d`, `campaign_cpp_7d`, `spend_share_7d`) grade HIT/MISS
 *  against `getAdSeries`+`windowsFor`; everything else — unrecognized metric,
 *  missing target_id, an unparseable direction, a null threshold, or a target
 *  ad with no synced series — gets flagged `needs_manual = true` instead of
 *  guessed, so it drops out of future runs (via the `needs_manual = false`
 *  filter) until an admin resolves it manually in the Council view. */
export async function resolveDuePredictions(
  brand: Brand,
  asOfSettled: string,
): Promise<{ resolved: number; manual: number }> {
  if (!isSupabaseConfigured()) return { resolved: 0, manual: 0 };
  const sb = getSupabase();
  const { data, error } = await sb
    .from('council_predictions')
    .select('*')
    .eq('brand', brand)
    .is('outcome', null)
    .eq('needs_manual', false)
    .lte('deadline', asOfSettled);
  if (error) throw new Error(`resolveDuePredictions: ${error.message}`);
  const rows = (data as PredictionRow[]) ?? [];
  if (rows.length === 0) return { resolved: 0, manual: 0 };

  // campaign_cpp_7d / spend_share_7d both need brand-wide trailing-7-settled-
  // day totals across every ad series — computed once, not per row.
  const series = await getAdSeries(brand);
  const seriesByAdId = new Map(series.map((s) => [s.adId, s]));
  let campaignSpend7 = 0;
  let campaignPurchases7 = 0;
  for (const s of series) {
    const w = windowsFor(s, asOfSettled);
    campaignSpend7 += w.spend7;
    campaignPurchases7 += w.purchases7;
  }
  const campaignCpp7 = campaignPurchases7 > 0 ? campaignSpend7 / campaignPurchases7 : null;

  let resolved = 0;
  let manual = 0;
  for (const row of rows) {
    const direction = parseDirection(row.prediction_text);
    const threshold = row.threshold;
    const actual = actualFor(row, seriesByAdId, campaignSpend7, campaignCpp7, asOfSettled);
    if (direction == null || threshold == null || actual == null) {
      const { error: manualErr } = await sb
        .from('council_predictions')
        .update({ needs_manual: true })
        .eq('id', row.id);
      if (manualErr) throw new Error(`resolveDuePredictions: ${manualErr.message}`);
      manual++;
      continue;
    }
    const hit = direction === 'lte' ? actual <= threshold : actual >= threshold;
    const { error: resolveErr } = await sb
      .from('council_predictions')
      .update({ outcome: hit ? 'hit' : 'miss', resolved_date: asOfSettled })
      .eq('id', row.id);
    if (resolveErr) throw new Error(`resolveDuePredictions: ${resolveErr.message}`);
    resolved++;
  }
  return { resolved, manual };
}

/** Rolling 90-day credibility weight per expert for `brand` (doctrine §6):
 *  1.0 + sum(scoreOf(...))*0.1 over every prediction that RESOLVED in the
 *  last 90 days, clamped [0.5, 2.0]. Experts with no resolved rows in the
 *  window fall back to the neutral 1.0 `credibilityWeight([])` already
 *  returns; all five keys are always present regardless of what the query
 *  returns. */
export async function getExpertWeights(brand: Brand): Promise<Record<Expert, number>> {
  const neutral = (): Record<Expert, number> => (
    { CHARLEY: 1.0, NICK: 1.0, BEN: 1.0, DARA: 1.0, CHAIR: 1.0 }
  );
  if (!isSupabaseConfigured()) return neutral();

  const sinceIso = isoDaysAgo(90);
  const { data, error } = await getSupabase()
    .from('council_predictions')
    .select('*')
    .eq('brand', brand)
    .not('outcome', 'is', null)
    .gte('resolved_date', sinceIso);
  if (error) throw new Error(`getExpertWeights: ${error.message}`);
  const rows = (data as PredictionRow[]) ?? [];

  const scoresByExpert = new Map<string, number[]>();
  for (const r of rows) {
    if (r.outcome == null) continue; // query already filters this; narrows for scoreOf below
    const arr = scoresByExpert.get(r.expert) ?? [];
    arr.push(scoreOf(r.outcome as 'hit' | 'miss' | 'push', r.weight));
    scoresByExpert.set(r.expert, arr);
  }

  const out = neutral();
  for (const expert of EXPERTS) out[expert] = credibilityWeight(scoresByExpert.get(expert) ?? []);
  return out;
}
