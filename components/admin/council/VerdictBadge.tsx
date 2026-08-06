import type { Tier, VerdictResult } from '@/lib/council/types';

/** Server-safe pill: tier emoji + tier word + role tag, e.g. "🟢 WINNING · PROSPECTOR".
 *  Reuses the admin shell's existing `pill pill-*` classes (no new CSS) —
 *  colors match the ROSTER line in lib/council/brief.ts (🟢 winning, 🟡
 *  watch, 🔴 loser, 🔵 learning). Missing verdict (ad not graded yet) →
 *  caller passes `undefined` and gets an em-dash. */
const TIER_EMOJI: Record<Tier, string> = {
  WINNING: '🟢',
  WATCH: '🟡',
  LOSER: '🔴',
  LEARNING: '🔵',
};
const TIER_PILL: Record<Tier, string> = {
  WINNING: 'pill-green',
  WATCH: 'pill-amber',
  LOSER: 'pill-red',
  LEARNING: 'pill-cyan',
};

export function VerdictBadge({ v }: { v: VerdictResult | undefined }) {
  if (!v) return <span className="text-slate-300">—</span>;
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`pill ${TIER_PILL[v.verdict]}`} title={v.headline}>
        {TIER_EMOJI[v.verdict]} {v.verdict} · {v.role}
      </span>
      {v.degraded && <span className="text-[10px] text-slate-400">· degraded</span>}
    </span>
  );
}
