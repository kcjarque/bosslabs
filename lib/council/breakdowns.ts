// lib/council/breakdowns.ts — placement + audience + micro-conversion-funnel
// breakdowns (spec §3e, §3f, §3g). Live Meta Graph pulls only, no storage.
// Best-effort throughout: any fetch failure degrades that section to
// []/zeros, never throws. Raw-fetch pattern mirrors lib/council/meta-sync.ts
// (lib/meta-ads.ts's graph()/token/version consts aren't exported).
import { brandFromCampaignName } from './meta-sync';

const GRAPH = process.env.META_GRAPH_VERSION || 'v23.0';
const ACCOUNT = process.env.META_ADS_ACCOUNT_ID || '118264717761938';

const num = (x: unknown): number => { const n = Number(x); return Number.isFinite(n) ? n : 0; };

type ActionVal = { action_type?: string; value?: unknown };
type InsightRow = Record<string, unknown>;

function actionsOf(row: InsightRow, field: 'actions' | 'action_values'): ActionVal[] {
  const v = row[field];
  return Array.isArray(v) ? (v as ActionVal[]) : [];
}
/** Sum the `value`s of every entry whose action_type is in `types`. Only
 *  correct for types that are mutually exclusive (e.g. a single event like
 *  landing_page_view) — see `pickActionType` for the omni-prefixed/plain pairs. */
function sumActionTypes(list: ActionVal[], types: string[]): number {
  return list.filter((a) => types.includes(a.action_type ?? '')).reduce((s, a) => s + num(a.value), 0);
}
/** Meta reports omni_purchase/omni_add_to_cart/omni_initiated_checkout as
 *  cross-channel-deduped totals that already INCLUDE the plain
 *  purchase/add_to_cart/initiate_checkout pixel event for the same
 *  conversions (confirmed against this account's live payload — e.g.
 *  omni_purchase 408649 vs purchase 407650, same conversions, not additive).
 *  Summing both would ~double revenue/purchases, so pick the first present
 *  type in priority order instead — same pattern as meta-sync.ts's pick(). */
function pickActionType(list: ActionVal[], typesByPriority: string[]): number {
  for (const t of typesByPriority) {
    const hit = list.find((a) => a.action_type === t);
    if (hit) return num(hit.value);
  }
  return 0;
}
/** Purchase-like action types in priority order — matches meta-sync.ts's
 *  purchasesOf/revenueOf exactly (omni_purchase, then plain purchase, then
 *  the pixel fallback some ad sets report under instead of either). Shared
 *  by every purchases/revenue read below (aggregateBreakdown's buckets +
 *  getWeekBreakdowns' funnel) so they can never drift out of sync with each
 *  other or with meta-sync.ts. */
const PURCHASE_TYPES = ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase'];

/** True when a row's campaign belongs to BOSS. This Meta account runs
 *  BOSS + CONX + LEO campaigns together (confirmed live: ~300 ads
 *  account-wide vs ~69 BOSS), so an unfiltered breakdown blends in the other
 *  brands' spend. Mirrors meta-sync.ts's syncAdMetricsDaily row filter
 *  ("launch scope: BOSS only", spec decision 2) exactly. */
function isBoss(row: InsightRow): boolean {
  return brandFromCampaignName(String(row.campaign_name ?? '')) === 'BOSS';
}

export type Row = {
  key: string;
  spendCentavos: number;
  revenueCentavos: number;
  roas: number | null;
  cpp: number | null;
  purchases: number;
};

export type Funnel = {
  linkClicks: number;
  lpViews: number;
  addToCart: number;
  initiateCheckout: number;
  purchases: number;
};

/**
 * Pure: groups Meta insight rows by `keyFields` (values joined with '/'),
 * sums spend/revenue/purchases, derives roas + cpp. Spend arrives from Meta
 * in pesos (→ ×100 centavos); revenue is the omni_purchase/purchase
 * action_values (→ ×100 centavos); purchases is the omni_purchase/purchase
 * actions count. roas is null on zero spend, cpp null on zero purchases —
 * same divide-by-zero guard style as verdict-engine's weekWindow.
 */
export function aggregateBreakdown(rows: InsightRow[], keyFields: string[]): Row[] {
  const buckets = new Map<string, { spendCentavos: number; revenueCentavos: number; purchases: number }>();
  for (const row of rows) {
    const key = keyFields.map((f) => String(row[f] ?? '')).join('/');
    const b = buckets.get(key) ?? { spendCentavos: 0, revenueCentavos: 0, purchases: 0 };
    b.spendCentavos += Math.round(num(row.spend) * 100);
    b.revenueCentavos += Math.round(pickActionType(actionsOf(row, 'action_values'), PURCHASE_TYPES) * 100);
    b.purchases += Math.round(pickActionType(actionsOf(row, 'actions'), PURCHASE_TYPES));
    buckets.set(key, b);
  }
  return Array.from(buckets.entries()).map(([key, b]) => ({
    key,
    spendCentavos: b.spendCentavos,
    revenueCentavos: b.revenueCentavos,
    roas: b.spendCentavos > 0 ? b.revenueCentavos / b.spendCentavos : null,
    cpp: b.purchases > 0 ? b.spendCentavos / b.purchases : null,
    purchases: b.purchases,
  }));
}

/** One best-effort `act_/insights` call for [weekStart, weekEnd]. Returns []
 *  on missing token, a Graph error, or any fetch/parse failure — callers
 *  never need their own try/catch around this. */
async function fetchInsights(
  weekStart: string,
  weekEnd: string,
  fields: string,
  breakdowns?: string,
): Promise<InsightRow[]> {
  const token = process.env.META_ADS_TOKEN;
  if (!token) return [];
  try {
    const timeRange = encodeURIComponent(JSON.stringify({ since: weekStart, until: weekEnd }));
    const bd = breakdowns ? `&breakdowns=${breakdowns}` : '';
    const url =
      `https://graph.facebook.com/${GRAPH}/act_${ACCOUNT}/insights` +
      `?level=ad&time_range=${timeRange}&fields=${fields}${bd}&limit=500&access_token=${token}`;
    const res = await fetch(url, { cache: 'no-store' });
    const json = (await res.json()) as { data?: InsightRow[]; error?: { message?: string } };
    if (json.error || !Array.isArray(json.data)) return [];
    return json.data;
  } catch {
    return [];
  }
}

/**
 * Placement + audience + micro-conversion-funnel breakdowns for one Mon–Sun
 * week (spec §3e placement, §3f audience, §3g funnel). 4 independent
 * best-effort Graph calls in parallel — a failure on any one only zeros that
 * section; this function itself never throws.
 */
export async function getWeekBreakdowns(
  weekStart: string,
  weekEnd: string,
): Promise<{ placement: Row[]; audience: Row[]; funnel: Funnel }> {
  const spendFields = 'spend,actions,action_values,campaign_name';
  const [placementRowsRaw, ageGenderRowsRaw, regionRowsRaw, funnelRowsRaw] = await Promise.all([
    fetchInsights(weekStart, weekEnd, spendFields, 'publisher_platform,platform_position'),
    fetchInsights(weekStart, weekEnd, spendFields, 'age,gender'),
    fetchInsights(weekStart, weekEnd, spendFields, 'region'),
    fetchInsights(weekStart, weekEnd, 'actions,inline_link_clicks,campaign_name'),
  ]);

  // This account is multi-brand (BOSS + CONX + LEO) — filter to BOSS BEFORE
  // aggregating so every breakdown/funnel figure below matches BOSS's real
  // spend, not the inflated whole-account total (see isBoss above).
  const placementRows = placementRowsRaw.filter(isBoss);
  const ageGenderRows = ageGenderRowsRaw.filter(isBoss);
  const regionRows = regionRowsRaw.filter(isBoss);
  const funnelRows = funnelRowsRaw.filter(isBoss);

  const placement = aggregateBreakdown(placementRows, ['publisher_platform', 'platform_position']);
  const audience = [
    ...aggregateBreakdown(ageGenderRows, ['age', 'gender']),
    ...aggregateBreakdown(regionRows, ['region']),
  ];

  // link_click from actions[]; inline_link_clicks is a fallback for accounts
  // where the actions entry is sparse/absent.
  const linkClicksFromActions = funnelRows.reduce((s, r) => s + sumActionTypes(actionsOf(r, 'actions'), ['link_click']), 0);
  const linkClicksFromField = funnelRows.reduce((s, r) => s + num(r.inline_link_clicks), 0);
  const funnel: Funnel = {
    linkClicks: Math.round(linkClicksFromActions || linkClicksFromField),
    lpViews: Math.round(funnelRows.reduce((s, r) => s + sumActionTypes(actionsOf(r, 'actions'), ['landing_page_view']), 0)),
    addToCart: Math.round(
      funnelRows.reduce((s, r) => s + pickActionType(actionsOf(r, 'actions'), ['omni_add_to_cart', 'add_to_cart']), 0),
    ),
    initiateCheckout: Math.round(
      funnelRows.reduce(
        (s, r) => s + pickActionType(actionsOf(r, 'actions'), ['omni_initiated_checkout', 'initiate_checkout']),
        0,
      ),
    ),
    purchases: Math.round(funnelRows.reduce((s, r) => s + pickActionType(actionsOf(r, 'actions'), PURCHASE_TYPES), 0)),
  };

  return { placement, audience, funnel };
}
