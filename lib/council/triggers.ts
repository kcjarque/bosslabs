/** Ads Council trigger detection — doctrine §5.3, pure + deterministic.
 *  A full council session (§5) convenes only when one of these fires; on a
 *  quiet day this returns [] and the brief simply notes "Council not
 *  convened." Reason strings are stored verbatim in the session record and
 *  shown to the operator, so they are exact and stable — not reworded. */
import type { VerdictResult } from './types';

export function detectTriggers(args: {
  todayVerdicts: VerdictResult[];
  blendedCppByDay: { date: string; cpp: number | null }[]; // last 3 settled days
  targetCppCentavos: number;
  missResolvedToday: boolean;
  windowClosedToday: boolean;
  isMondayManila: boolean;
}): string[] {
  const { todayVerdicts, blendedCppByDay, targetCppCentavos, missResolvedToday, windowClosedToday, isMondayManila } = args;
  const reasons: string[] = [];

  // Any ad flips to LOSER — one reason per ad, named.
  for (const v of todayVerdicts) {
    if (v.verdict === 'LOSER' && v.changed) reasons.push(`loser-flip: ${v.adName}`);
  }

  // >=2 ads flip to WATCH the same day.
  const watchFlips = todayVerdicts.filter((v) => v.verdict === 'WATCH' && v.changed).length;
  if (watchFlips >= 2) reasons.push(`watch-flips: ${watchFlips} same day`);

  // Blended CPP breaches target 3 consecutive settled days.
  const last3 = blendedCppByDay.slice(-3);
  const cppBreach = last3.length === 3 && last3.every((d) => d.cpp != null && d.cpp > targetCppCentavos);
  if (cppBreach) reasons.push('cpp-breach: 3 days over target');

  if (missResolvedToday) reasons.push('prediction-miss resolved');
  if (windowClosedToday) reasons.push('action-window closed');
  if (isMondayManila) reasons.push('monday session');

  return reasons;
}
