// lib/council/economics.ts — profit anchor math (spec §3h). All centavos in/out.
import type { CouncilSettingsRow } from './types';

export type Economics = {
  targetRoas: number; breakevenRoas: number; targetCppCentavos: number;
  processingFeePct: number; dailyNetTargetCentavos: number; backEndNote: string;
  configured: boolean; // false → Prince must say "no profit anchor" + read conservatively
};

export function economicsFromSettings(s: CouncilSettingsRow): Economics {
  const configured = s.targetRoas > 0 && s.dailyNetTargetCentavos > 0;
  return {
    targetRoas: s.targetRoas || 1.0,
    breakevenRoas: s.breakevenRoas || 1 / (1 - (s.processingFeePct || 0.035)),
    targetCppCentavos: s.targetCppCentavos,
    processingFeePct: s.processingFeePct ?? 0.035,
    dailyNetTargetCentavos: s.dailyNetTargetCentavos || 0,
    backEndNote: s.backEndNote || '',
    configured,
  };
}

/** Net profit for a day: revenue − spend − processing, where revenue = spend×roas. */
export function dailyNetCentavos(spendCentavos: number, roas: number, feePct: number): number {
  return Math.round(spendCentavos * (roas * (1 - feePct) - 1));
}

/** Spend/day needed to hit a net target AT a given ROAS. 0 if the ROAS can't clear breakeven. */
export function targetNetSpendCentavos(dailyNetTargetCentavos: number, targetRoas: number, feePct: number): number {
  const perPeso = targetRoas * (1 - feePct) - 1;
  return perPeso > 0 ? Math.round(dailyNetTargetCentavos / perPeso) : 0;
}

export function netGapCentavos(currentNetCentavos: number, targetNetCentavos: number): number {
  return targetNetCentavos - currentNetCentavos;
}
