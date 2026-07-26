/**
 * Homepage A/B testing — config, arm resolution, and history.
 *
 * The whole test lives in the webinar funnel's `config` JSONB (no migration):
 *   config.abTest    → the CURRENT test (running or stopped)
 *   config.abHistory → past tests, newest first
 *
 * A visitor is bucketed by the sticky `bl_ab_roll` cookie (0–99, set once by
 * middleware). The public URL never changes — https://www.bosslabs.live serves
 * both arms — so the ad link is unaffected by anything here.
 */

/** Every design the homepage can serve. Exactly TWO run at a time. */
export type VariantKey = 'control' | 'b' | 'c' | 'd';

export const VARIANT_CATALOG: Record<
  VariantKey,
  { label: string; blurb: string; preview: string }
> = {
  control: {
    label: 'Original design',
    blurb: 'The previous homepage — ₱100K/month outcome hero.',
    preview: '/?preview=control',
  },
  d: {
    label: 'Current design',
    blurb: '₱500K-quote reframe — build-it-yourself hero, clickable sample app.',
    preview: '/?preview=d',
  },
  b: {
    label: 'Conversion-first',
    blurb: 'Bento proof grids, self-typing terminal, sticky CTA, FAQ.',
    preview: '/?preview=b',
  },
  c: {
    label: 'Competition-killer',
    blurb: 'Outcome-first hero, itemized bonus stack, sharpened apps moat.',
    preview: '/?preview=c',
  },
};

export type AbTestConfig = {
  status: 'running' | 'stopped';
  /** Arm A design. */
  variantA: VariantKey;
  /** Arm B design. */
  variantB: VariantKey;
  /** % of visitors shown arm A (0–100). The rest see arm B. */
  splitAPct: number;
  /** When this test started collecting data (ISO). */
  startedAt: string;
  /** When it was stopped (ISO), null while running. */
  endedAt: string | null;
  /** Which arm won — set when stopping. The winner is then served to 100%. */
  winner: 'a' | 'b' | null;
};

export type AbHistoryEntry = AbTestConfig & {
  /** Result snapshot captured at stop time, so history stays true even after
   *  more sales land or variants get reused in a later test. */
  result?: {
    aPaid: number;
    bPaid: number;
    aRevenueCentavos: number;
    bRevenueCentavos: number;
    aConvPct: number;
    bConvPct: number;
  } | null;
};

/** The live 50/50 control-vs-current test, backdated to the moment it shipped
 *  (commit cbead31, 2026-07-26 10:46 PHT) so the very first window is honest
 *  even before anyone touches the admin card. */
export const DEFAULT_AB_TEST: AbTestConfig = {
  status: 'running',
  variantA: 'control',
  variantB: 'd',
  splitAPct: 50,
  startedAt: '2026-07-26T02:46:02.000Z',
  endedAt: null,
  winner: null,
};

const VALID = new Set<VariantKey>(['control', 'b', 'c', 'd']);

function clampPct(n: unknown): number {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 50;
}

function asVariant(v: unknown, fallback: VariantKey): VariantKey {
  return typeof v === 'string' && VALID.has(v as VariantKey) ? (v as VariantKey) : fallback;
}

/** Read (and sanitise) the current test out of a funnel config blob. */
export function readAbTest(config: Record<string, unknown> | undefined | null): AbTestConfig {
  const raw = (config?.abTest ?? null) as Partial<AbTestConfig> | null;
  if (!raw || typeof raw !== 'object') return DEFAULT_AB_TEST;
  const status = raw.status === 'stopped' ? 'stopped' : 'running';
  return {
    status,
    variantA: asVariant(raw.variantA, DEFAULT_AB_TEST.variantA),
    variantB: asVariant(raw.variantB, DEFAULT_AB_TEST.variantB),
    splitAPct: clampPct(raw.splitAPct ?? DEFAULT_AB_TEST.splitAPct),
    startedAt:
      typeof raw.startedAt === 'string' && raw.startedAt
        ? raw.startedAt
        : DEFAULT_AB_TEST.startedAt,
    endedAt: typeof raw.endedAt === 'string' && raw.endedAt ? raw.endedAt : null,
    winner: raw.winner === 'a' || raw.winner === 'b' ? raw.winner : null,
  };
}

export function readAbHistory(
  config: Record<string, unknown> | undefined | null,
): AbHistoryEntry[] {
  const raw = config?.abHistory;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e): e is AbHistoryEntry => Boolean(e) && typeof e === 'object')
    .slice(0, 30);
}

export type Arm = 'a' | 'b';

/** Which arm a sticky roll lands in. Non-numeric rolls fall to B so a
 *  cookieless hit still renders something sensible. */
export function armFromRoll(roll: number, splitAPct: number): Arm {
  return Number.isFinite(roll) && roll < splitAPct ? 'a' : 'b';
}

export function armFromCookie(raw: string | undefined | null, splitAPct: number): Arm {
  return armFromRoll(Number(raw ?? NaN), splitAPct);
}

/**
 * The design to serve for this visitor.
 * - running → split by the sticky roll
 * - stopped → the declared winner (the test is over; everyone gets one design)
 */
export function resolveAbVariant(
  test: AbTestConfig,
  cookieRoll: string | undefined | null,
): { variant: VariantKey; arm: Arm } {
  if (test.status === 'stopped') {
    const arm: Arm = test.winner ?? 'b';
    return { variant: arm === 'a' ? test.variantA : test.variantB, arm };
  }
  const arm = armFromCookie(cookieRoll, test.splitAPct);
  return { variant: arm === 'a' ? test.variantA : test.variantB, arm };
}
