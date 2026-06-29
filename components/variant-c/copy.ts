/**
 * Variant C copy — the "competition-killer" rebuild informed by audit of
 * aibuilderssummit.live. Lives locally to variant-c so control + variant-B
 * stay untouched. The big-swing differences vs control:
 *
 *  1. Outcome-first headline (buyer outcome, not the tool)
 *  2. Singular, finishable deliverable ("ONE working app")
 *  3. Itemized phantom bonus pricing (anchoring like AIBS's ₱12,500 breakdown)
 *  4. "For you if / not for you if" filter (qualifies tire-kickers out)
 *  5. Sharper FAQ (8 objections, operator voice)
 *
 * Brand voice + dark builder vibe + Taglish + 7-day refund are unchanged —
 * those are things AIBS can't copy.
 */

/* HEADLINE — outcome-first, ONE cyan accent, qualifier demoted.
   Audit fix (2026-06-29): the previous shape had ~60% of the headline in
   cyan italic, flattening hierarchy. New shape: one dominant hook with
   ONE cyan accent (the concrete number — that's the hero), qualifier
   moved to a smaller demoted line below, body subhead shortened to a
   single sentence. */
export const HEADLINE_C = {
  /** White, biggest. */
  main: 'Ship your first AI-built app',
  /** Cyan accent — the concrete, scannable specificity. */
  accent: 'in 24 hours.',
  /** Medium gray, smaller. The "even if" reassurance. */
  qualifier: "Stop hiring devs. Even if you've never touched code.",
};

/** Subhead body — one sentence, scan-friendly. The longer Taglish pitch
 *  moved into the WhoFor / Manifesto sections below the fold. */
export const SUBHEADLINE_C =
  'Walk in with an idea. Walk out with a working app you ship Monday.';

/** Microcopy under the hero CTA — social proof at the conversion moment. */
export const CTA_MICROCOPY_C =
  'Join 3,000+ Filipino founders who already shipped';

/* DELIVERABLE — singular + finishable. Replaces vague "real systems in 24h". */
export const DELIVERABLE_C = {
  eyebrow: 'WHAT YOU WALK OUT WITH',
  headline: 'One real app. Built in front of you. Live URL by the time you log off.',
  subline:
    'Not a slide deck. Not a "framework." A working app you ship Monday — the same way we shipped the five live apps below.',
};

/* BONUS — itemized so the anchor reads like AIBS's ₱12,500 → ₱999 stack
   instead of our current single ₱4,997 badge. Sums to ₱4,997. */
export type BonusItem = { label: string; description: string; valuePhp: number };
export const BONUS_ITEMS_C: BonusItem[] = [
  {
    label: 'Claude Code Skills Pack',
    description: 'Reusable sales, ops, hiring, and content skills you drop into any project.',
    valuePhp: 1497,
  },
  {
    label: 'Starter Repo Bundle',
    description: 'CRM, HR portal, booking tool, AI agent — clone, customize, ship.',
    valuePhp: 997,
  },
  {
    label: 'Claude Code Prompt Library',
    description: 'The exact prompts we use to ship in 24 hours, copy-paste ready.',
    valuePhp: 997,
  },
  {
    label: '"Audit Your Business in 30 Minutes" Checklist',
    description: 'Find the ONE workflow worth automating first. No more guessing.',
    valuePhp: 497,
  },
  {
    label: '7-Day Workshop Replay',
    description: 'Watch back, build along, share with your team. Yours for a week.',
    valuePhp: 1009,
  },
];
export const BONUS_TOTAL_C = BONUS_ITEMS_C.reduce((s, b) => s + b.valuePhp, 0); // 4,997

/* LIVE-APPS HEADLINE — sharpened from variant-B's generic title.
   This block is our moat (clickable proof) — make sure the headline above
   makes the reader actually click the apps. */
export const LIVE_APPS_HEADLINE_C =
  'Five real apps. All running right now. All built by us with Claude Code.';
export const LIVE_APPS_SUBLINE_C =
  'Don\'t take our word — click each one. If we can ship five, you can ship one.';
