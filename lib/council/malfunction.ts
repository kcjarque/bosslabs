// lib/council/malfunction.ts — deterministic "is it just broken?" pre-check
// (spec §0b, Stage 1 malfunction-first). Flags candidate outages so the council
// rules them out BEFORE prescribing creative/audience fixes. Pure + testable.
import type { AdSeries } from './types';

export type Malfunction = {
  adId: string;
  adName: string;
  kind: 'DISAPPROVED' | 'REVENUE_CLIFF' | 'LP_COLLAPSE';
  detail: string;
};

const CLIFF_SPEND_FLOOR = 50_000; // ₱500 — only flag ads that actually spent real money on the day

/** @param series per-ad daily series. @param adStatus adId→effective_status (getAdStatuses).
 *  @param asOf the settled day (today−3) the checks anchor to. */
export function detectMalfunctions(series: AdSeries[], adStatus: Map<string, string>, asOf: string): Malfunction[] {
  const out: Malfunction[] = [];
  for (const s of series) {
    const status = adStatus.get(s.adId) ?? '';
    if (status === 'WITH_ISSUES') {
      out.push({
        adId: s.adId, adName: s.adName, kind: 'DISAPPROVED',
        detail: 'Status is WITH_ISSUES (likely disapproved / in review) — fix or replace before optimizing.',
      });
    }
    // Cliffs on a non-delivering ad are just history, not a live outage.
    if (status !== 'ACTIVE') continue;
    const today = s.days.find((d) => d.date === asOf);
    if (!today) continue;
    const prior = s.days.filter((d) => d.date < asOf).slice(-2);
    if (prior.length === 0) continue;

    // REVENUE_CLIFF: spending real money today, zero purchases, but was selling before → pixel/tracking break.
    const priorPurchAvg = prior.reduce((a, d) => a + d.purchases, 0) / prior.length;
    if (today.spendCentavos >= CLIFF_SPEND_FLOOR && today.purchases === 0 && priorPurchAvg >= 1) {
      out.push({
        adId: s.adId, adName: s.adName, kind: 'REVENUE_CLIFF',
        detail: `Spent ₱${Math.round(today.spendCentavos / 100).toLocaleString()} on ${asOf} with 0 purchases, after ~${priorPurchAvg.toFixed(1)} buyers/day before — check pixel/tracking before touching creative.`,
      });
    }

    // LP_COLLAPSE: clicks still flowing but landing-page views crater → page down/slow, not creative.
    const rate = (d: AdSeries['days'][number]) => (d.linkClicks > 0 ? d.lpViews / d.linkClicks : null);
    const todayRate = rate(today);
    const priorRates = prior.map(rate).filter((x): x is number => x != null);
    const priorRateAvg = priorRates.length ? priorRates.reduce((a, b) => a + b, 0) / priorRates.length : null;
    if (today.linkClicks >= 30 && todayRate != null && priorRateAvg != null && priorRateAvg > 0 && todayRate < 0.2 * priorRateAvg) {
      out.push({
        adId: s.adId, adName: s.adName, kind: 'LP_COLLAPSE',
        detail: `Landing-page views fell to ${(todayRate * 100).toFixed(0)}% of clicks on ${asOf} (was ~${(priorRateAvg * 100).toFixed(0)}%) — the page may be down/slow, not a creative issue.`,
      });
    }
  }
  return out;
}
