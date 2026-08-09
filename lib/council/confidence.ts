// lib/council/confidence.ts — minimum-signal rule (spec §0b). Every evidence read
// (ad, placement, segment, day-of-week, funnel step) is tagged by how much data
// backs it. HARD RULE (enforced in the prompts): no cut/scale/exclude may rest on
// NOISE-tier evidence; DIRECTIONAL reads must be labeled as such.
export type Confidence = 'SOLID' | 'DIRECTIONAL' | 'NOISE';

export function confidenceFor(purchases: number, spendCentavos: number, blendedCppCentavos: number): Confidence {
  const cpa = blendedCppCentavos > 0 ? blendedCppCentavos : 65_000; // fall back to the ₱650 target CPA
  if (purchases >= 10 || spendCentavos >= 3 * cpa) return 'SOLID';
  if (purchases >= 3 || spendCentavos >= cpa) return 'DIRECTIONAL';
  return 'NOISE';
}
