/**
 * Homepage A/B test — OLD design (A) vs CURRENT design (B), 50/50.
 *
 * Single source of truth so the homepage router (app/page.tsx) and the
 * checkout attribution (app/api/checkout/route.ts) bucket a visitor the
 * SAME way from the SAME sticky cookie (`bl_ab_roll`, 0–99, set once per
 * visitor by middleware). The public URL never changes — the split is
 * entirely server-side, so the ad link https://www.bosslabs.live keeps
 * working exactly as before.
 *
 *   A = 'control'  → the original funnel design
 *   B = 'd'        → the current ₱500K-reframe design (site default before the test)
 */
export type HomeAB = 'a' | 'b';

/** % of visitors shown design A (old). The rest see B (current). 50 = even split. */
export const AB_SPLIT_A_PCT = 50;

/** Map a sticky roll (0–99) to a design arm. Non-numeric rolls fall to B so a
 *  cookieless hit still renders the current default rather than nothing. */
export function homeArmFromRoll(roll: number): HomeAB {
  return Number.isFinite(roll) && roll < AB_SPLIT_A_PCT ? 'a' : 'b';
}

/** Read the arm from the raw cookie value (string | undefined). */
export function homeArmFromCookie(raw: string | undefined | null): HomeAB {
  return homeArmFromRoll(Number(raw ?? NaN));
}
