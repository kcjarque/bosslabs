/** Ads Council verdict engine — doctrine §5.2, pure + deterministic.
 *  Windows end at the settled day (asOf = D-3); rows after asOf are ignored.
 *  t7/p7 select by CALENDAR DATE (asOf-6..asOf, asOf-13..asOf-7), not array
 *  position, so a gap in delivery can't silently shift the window. Delta
 *  signals (CPP/share/CTR/CPM change) only compute when BOTH windows have
 *  ≥4 delivery days; thin windows fall back to absolute-only grading. */
import type { AdSeries, CampaignWindow, CouncilSettingsRow, Tier, Role, VerdictResult } from './types';

const MS_DAY = 86400000;
const peso = (c: number) => `₱${Math.round(c / 100).toLocaleString()}`;

function slice7(series: AdSeries, asOf: string) {
  const asOfMs = Date.parse(asOf);
  const upTo = series.days.filter((d) => d.date <= asOf);
  const t7 = series.days.filter((d) => {
    const ms = Date.parse(d.date);
    return ms >= asOfMs - 6 * MS_DAY && ms <= asOfMs;
  });
  const p7 = series.days.filter((d) => {
    const ms = Date.parse(d.date);
    return ms >= asOfMs - 13 * MS_DAY && ms <= asOfMs - 7 * MS_DAY;
  });
  return { t7, p7, upTo };
}
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const avg = (xs: number[]) => (xs.length ? sum(xs) / xs.length : null);

export function windowsFor(series: AdSeries, asOf: string) {
  const { t7, p7, upTo } = slice7(series, asOf);
  const spend7 = sum(t7.map((d) => d.spendCentavos));
  const spendPrior7 = sum(p7.map((d) => d.spendCentavos));
  const purchases7 = sum(t7.map((d) => d.purchases));
  const purchasesPrior7 = sum(p7.map((d) => d.purchases));
  // Link clicks + reach power the CPP decomposition (CPM=audience, link-CTR=
  // creative, CVR=post-click/offer, frequency+CTR-trend=fatigue).
  const linkClicks7 = sum(t7.map((d) => d.linkClicks));
  const linkClicksPrior7 = sum(p7.map((d) => d.linkClicks));
  const first = upTo[0]?.date;
  const ageDays = first ? Math.floor((Date.parse(asOf) - Date.parse(first)) / MS_DAY) + 1 : 0;
  return {
    spend7, spendPrior7, purchases7, purchasesPrior7,
    cpp7: purchases7 > 0 ? spend7 / purchases7 : null,
    cppPrior7: purchasesPrior7 > 0 ? spendPrior7 / purchasesPrior7 : null,
    freq7: avg(t7.map((d) => d.frequency).filter((x): x is number => x != null)),
    ctr7: avg(t7.map((d) => d.ctr).filter((x): x is number => x != null)),
    ctrPrior7: avg(p7.map((d) => d.ctr).filter((x): x is number => x != null)),
    // link-CTR (intent clicks) is the truer creative signal than all-CTR.
    linkCtr7: avg(t7.map((d) => d.linkCtr).filter((x): x is number => x != null)),
    linkCtrPrior7: avg(p7.map((d) => d.linkCtr).filter((x): x is number => x != null)),
    cpm7: avg(t7.map((d) => d.cpm).filter((x): x is number => x != null)),
    cpmPrior7: avg(p7.map((d) => d.cpm).filter((x): x is number => x != null)),
    // CVR = purchases per link click, as a percentage. The post-click lever:
    // good CTR + high CPP → the leak is here (offer/landing/audience-intent).
    cvr7: linkClicks7 > 0 ? (purchases7 / linkClicks7) * 100 : null,
    cvrPrior7: linkClicksPrior7 > 0 ? (purchasesPrior7 / linkClicksPrior7) * 100 : null,
    linkClicks7, linkClicksPrior7,
    impressions7: sum(t7.map((d) => d.impressions)),
    reach7: sum(t7.map((d) => d.reach)),
    // Creative-quality (VIDEO only — null on image ads so they aren't scored on
    // metrics they can't have) + funnel decomposition of CVR.
    ...(() => {
      const impr = sum(t7.map((d) => d.impressions));
      const video3s = sum(t7.map((d) => d.video3s));
      const thruplays = sum(t7.map((d) => d.thruplays));
      const lpViews = sum(t7.map((d) => d.lpViews));
      // A real VIDEO ad's plays are a large fraction of impressions; an IMAGE ad
      // logs at most a few stray plays. Require plays >= 10% of impressions
      // before reporting hook/hold, so images read as N/A (not a bogus ~0%).
      const isVideo = impr > 0 && video3s >= impr * 0.1;
      return {
        hookRate7: isVideo ? (video3s / impr) * 100 : null, // thumbstop % (video only)
        holdRate7: isVideo ? (thruplays / video3s) * 100 : null, // % of stoppers who held (video only)
        lpViewRate7: linkClicks7 > 0 ? (lpViews / linkClicks7) * 100 : null, // % of clicks that loaded the page
        viewToPurchase7: lpViews > 0 ? (purchases7 / lpViews) * 100 : null, // % of landers who bought
      };
    })(),
    lifetimePurchases: sum(upTo.map((d) => d.purchases)),
    lifetimeSpend: sum(upTo.map((d) => d.spendCentavos)),
    ageDays,
    t7Days: t7.length,
    p7Days: p7.length,
  };
}

function roleOf(freq7: number | null): Role {
  if (freq7 == null) return 'HYBRID';
  if (freq7 < 1.3) return 'PROSPECTOR';
  if (freq7 >= 2.0) return 'CLOSER';
  return 'HYBRID';
}

export function gradeAd(args: {
  series: AdSeries;
  campaign: CampaignWindow & { campaignSpend7ByAd: Record<string, number>; campaignSpendPrior7ByAd: Record<string, number> };
  settings: CouncilSettingsRow;
  asOf: string;
  prev: { verdict: Tier; daysInTier: number } | null;
  historyDays: number;
}): VerdictResult {
  const { series, campaign, settings, asOf, prev, historyDays } = args;
  const w = windowsFor(series, asOf);
  const target = settings.targetCppCentavos;
  const role = roleOf(w.freq7);

  // Reliability guard: a thin window (e.g. 1 delivery day) makes percentage
  // deltas explode. Require ≥4 delivery days in EACH window before trusting
  // any delta signal; otherwise the ad grades on absolute checks only.
  const reliable = w.t7Days >= 4 && w.p7Days >= 4;

  const totalSpend7 = Math.max(1, Object.values(campaign.campaignSpend7ByAd).reduce((a, b) => a + b, 0));
  const totalPrior7 = Math.max(1, Object.values(campaign.campaignSpendPrior7ByAd).reduce((a, b) => a + b, 0));
  const share7 = w.spend7 / totalSpend7;
  const sharePrior7 = (campaign.campaignSpendPrior7ByAd[series.adId] ?? 0) / totalPrior7;
  const shareDelta: number | null = !reliable ? null : (sharePrior7 > 0 ? (share7 - sharePrior7) / sharePrior7 : 0);

  const cppDeltaPct = reliable && w.cpp7 != null && w.cppPrior7 != null && w.cppPrior7 > 0
    ? ((w.cpp7 - w.cppPrior7) / w.cppPrior7) * 100 : null;
  const ctrFalling = reliable && w.ctr7 != null && w.ctrPrior7 != null && w.ctr7 < w.ctrPrior7 * 0.95;
  const cpmSpiking = reliable && w.cpm7 != null && w.cpmPrior7 != null && w.cpmPrior7 > 0
    && w.cpm7 > w.cpmPrior7 * 1.25 && !ctrFalling;

  const deciding: Record<string, number | null> = {
    cpp_7d: w.cpp7 != null ? Math.round(w.cpp7) : null,
    cpp_prior_7d: w.cppPrior7 != null ? Math.round(w.cppPrior7) : null,
    cpp_delta_pct: cppDeltaPct != null ? Math.round(cppDeltaPct) : null,
    spend_share_7d: Number(share7.toFixed(3)),
    spend_share_delta: shareDelta != null ? Number(shareDelta.toFixed(3)) : null,
    freq_7d: w.freq7 != null ? Number(w.freq7.toFixed(2)) : null,
    ctr_7d: w.ctr7 != null ? Number(w.ctr7.toFixed(2)) : null,
    lifetime_purchases: w.lifetimePurchases,
  };

  const make = (verdict: Tier, degraded: boolean, headline: string, interpretation: string, flip: string): VerdictResult => ({
    adId: series.adId, adName: series.adName, brand: series.brand, date: asOf,
    verdict, role, degraded,
    daysInTier: prev && prev.verdict === verdict ? prev.daysInTier + 1 : 1,
    changed: prev != null && prev.verdict !== verdict,
    decidingMetrics: deciding,
    headline: headline.slice(0, 90), interpretation, tierFlipCondition: flip,
  });

  // Data-mode guard (§4.1): tiers need trailing windows.
  if (historyDays < 14) {
    return make('LEARNING', true,
      `Degraded data — ${historyDays}d of history; needs 14d before real tiers.`,
      `Only ${historyDays} days of campaign history are synced. The engine grades on trailing 7d vs prior 7d windows, so real tiers unlock at 14 days. Run/await backfill.`,
      `Graduates when campaign history ≥14 days.`);
  }
  // LOSER zero-purchase check outranks the <10-purchase LEARNING gate: an ad
  // that burned 3× target with zero buys graduated by burning budget (§5.2).
  if (w.ageDays > 3 && w.lifetimePurchases === 0 && w.lifetimeSpend > 3 * target) {
    return make('LOSER', false,
      `Zero buyers after ${peso(w.lifetimeSpend)} — kill and replace.`,
      `Spent ${peso(w.lifetimeSpend)} (>3× target CPP ${peso(target)}) with zero purchases post-learning. Doctrine §5.2 zero-purchase rule. Respect the 20%-of-daily-spend subtraction cap when pausing; replace with a concept covering the same slot.`,
      `Already terminal — any purchase before pause would re-grade next run.`);
  }
  // LEARNING (§5.2 first match)
  if (w.ageDays <= 3 || w.lifetimePurchases < 10) {
    const need = Math.max(0, 10 - w.lifetimePurchases);
    return make('LEARNING', false,
      `In learning — needs ${need > 0 ? `${need} more purchase${need === 1 ? '' : 's'}` : `${4 - w.ageDays} more day(s)`} to graduate.`,
      `Ad is ${w.ageDays} day(s) old with ${w.lifetimePurchases} lifetime purchases. No verdict permitted under 72h/10-purchase gate (Ground Truth). It graduates at 10 purchases and >72h.`,
      `Graduates when lifetime purchases ≥10 and age >72h.`);
  }

  // LOSER — full §7.6 fatigue (approximated over settled windows) or red-flag.
  const fatigued = cppDeltaPct != null && cppDeltaPct >= 20 && shareDelta != null && shareDelta < 0
    && (ctrFalling || (w.freq7 ?? 0) > (role === 'CLOSER' ? 3.5 : 1.8));
  const redFlag = share7 >= 0.2 && w.cpp7 != null && campaign.blendedCpp7Centavos != null
    && campaign.blendedCpp7Centavos > 0 && w.cpp7 > campaign.blendedCpp7Centavos * 1.3;

  // RECOVERY GUARD — never recommend cutting an ad that is converting cheaply
  // RIGHT NOW. The settled windows above end at D-3 (Meta restates for 72h), so
  // a bad 7-day stretch can be stale: the ad may have bounced back on the last
  // 1-2 (still-preliminary) days. Using fresh data only to WITHHOLD a
  // destructive verdict is always safe — it can downgrade LOSER→WATCH, never
  // escalate. Recovering = ≥2 purchases in the preliminary tail at a blended
  // cost within 1.2× target. This is the fix for "it told me to kill an ad
  // that's still generating sales."
  const tail = series.days.filter((d) => d.date > asOf);
  const tailPurch = tail.reduce((s, d) => s + d.purchases, 0);
  const tailSpend = tail.reduce((s, d) => s + d.spendCentavos, 0);
  const tailCpp = tailPurch > 0 ? tailSpend / tailPurch : null;
  const recovering = tailCpp != null && tailPurch >= 2 && tailCpp <= target * 1.2;

  if ((fatigued || redFlag) && recovering) {
    return make('WATCH', false,
      `Was getting expensive, but bounced back — ${tailPurch} buyers at ${peso(tailCpp!)} in the last few days. Watch, don't cut.`,
      `The settled 7-day window (through ${asOf}) looked fatigued (CPP ${cppDeltaPct != null ? `+${Math.round(cppDeltaPct)}%` : 'up'}), but the most recent days recovered: ${tailPurch} purchases at ${peso(tailCpp!)} each, at or below target ${peso(target)}. Not a cut — the fatigue read is stale. Hold and re-check once these days settle.`,
      `Becomes a real cut only if the recovery fades: CPP back above ${peso(Math.round(target * 1.3))} with no cheap days for 3 straight settled days.`);
  }

  if (fatigued || redFlag) {
    return make('LOSER', false,
      fatigued
        ? `Fatigued: CPP +${Math.round(cppDeltaPct!)}%, share ${Math.round(shareDelta! * 100)}% — pause within cap.`
        : `Top-spend ad at ${Math.round((w.cpp7! / campaign.blendedCpp7Centavos!) * 100)}% of blended CPP — wrong crowd.`,
      fatigued
        ? `CPP ${peso(w.cppPrior7!)} → ${peso(w.cpp7!)} (+${Math.round(cppDeltaPct!)}%), spend share falling, engagement deteriorating — the full fatigue definition (§7.6). Pause respecting the 20%-of-daily-spend cap and replace the slot.`
        : `Charley's red flag: the machine keeps feeding it (share ${Math.round(share7 * 100)}%) while CPP runs ${peso(w.cpp7!)} vs blended ${peso(campaign.blendedCpp7Centavos!)}. It is buying the wrong crowd. Pause within the 20% cap.`,
      `Re-grades WINNING if CPP_7d ≤ ${peso(target)} for 3 consecutive settled days.`);
  }

  // WATCH — one or more deterioration signals (severity order: CPP > share > freq/CTR > CPM).
  const signals: string[] = [];
  if (cppDeltaPct != null && cppDeltaPct >= 10) signals.push(`CPP +${Math.round(cppDeltaPct)}% this week`);
  if (shareDelta != null && shareDelta <= -0.2) signals.push(`spend share down ${Math.round(-shareDelta * 100)}% — Andromeda cooling on it`);
  if (ctrFalling && w.freq7 != null && w.freq7 >= 1.5 && role !== 'CLOSER') signals.push(`frequency ${w.freq7.toFixed(1)} rising while CTR falls`);
  if (cpmSpiking) signals.push(`CPM +${Math.round(((w.cpm7! - w.cpmPrior7!) / w.cpmPrior7!) * 100)}% on flat CTR`);
  if (signals.length > 0) {
    const [worst, ...rest] = signals;
    const multi = rest.length > 0;
    const headline = multi
      ? `${worst} (+${rest.length} more) — ${signals.length} deterioration signals, still not LOSER.`
      : `${worst}. LOSER if the trend holds; one signal alone isn't actionable.`;
    const interpretation = multi
      ? `${signals.length} deterioration signals: ${signals.join('; ')}. Short of the full fatigue conjunction (§7.6) or red-flag — pausing a WATCH ad is a protocol violation (§5.2). Threshold to LOSER: CPP ≥ ${peso(Math.round((w.cppPrior7 ?? target) * 1.2))} sustained 3 days with share still falling.`
      : `One deterioration signal: ${worst}. One signal is early warning, not actionable — pausing a WATCH ad is a protocol violation (§5.2). Threshold to LOSER: CPP ≥ ${peso(Math.round((w.cppPrior7 ?? target) * 1.2))} sustained 3 days with share still falling.`;
    return make('WATCH', false, headline, interpretation,
      `Becomes LOSER if CPP_7d ≥ +20% vs prior AND share declining for 3 consecutive settled days.`);
  }

  // WINNING
  const jobLine = role === 'PROSPECTOR' ? 'Prospecting engine' : role === 'CLOSER' ? 'Closer doing closer work' : 'Hybrid workhorse';
  return make('WINNING', false,
    `${jobLine} at ${w.cpp7 != null ? peso(w.cpp7) : '—'} CPP. Do not touch.`,
    `7d CPP ${w.cpp7 != null ? peso(w.cpp7) : '—'} ≤ target ${peso(target)}, spend share ${Math.round(share7 * 100)}% ${shareDelta != null && shareDelta >= 0 ? 'rising' : 'stable'}, ${role.toLowerCase()} metrics healthy. Demotes to WATCH on any single deterioration signal (CPP +10%, share −20%, freq↑/CTR↓, CPM +25%).`,
    `Demotes to WATCH if spend share drops >20% or CPP rises >10% week-over-week.`);
}
