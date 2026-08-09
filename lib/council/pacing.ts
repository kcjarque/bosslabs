// lib/council/pacing.ts — pacing / budget utilization (spec §3c). Pure, no
// network: tells "weak results" apart from "under-delivering" (or "budget-
// capped, ready to scale") by joining this-week average daily spend to the
// campaign's/ad-set's declared daily budget.
export function utilization(
  avgDailySpendCentavos: number,
  dailyBudgetCentavos: number | null,
): { pct: number | null; underDelivering: boolean; budgetCapped: boolean } {
  if (dailyBudgetCentavos == null || dailyBudgetCentavos <= 0) {
    return { pct: null, underDelivering: false, budgetCapped: false };
  }
  const pct = avgDailySpendCentavos / dailyBudgetCentavos;
  return { pct, underDelivering: pct < 0.7, budgetCapped: pct >= 0.95 };
}
