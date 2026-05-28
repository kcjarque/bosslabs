/**
 * Shared VibeCode Retreat constants + helpers used by the reservation
 * flow (modal form, /api/retreat/*, and the payment + thank-you pages).
 */
import type { EventFunnelConfig } from './db';
import { formatPHP } from './config';

/** Where reservation payments are sent. Shown as cards on the payment page. */
export const RETREAT_BANKS = [
  { method: 'BPI', name: 'Kyle Matthew Jarque', number: '2609195765' },
  { method: 'BDO', name: 'Kyle Matthew C. Jarque', number: '010970053681' },
  { method: 'Maya', name: 'Kyle Matthew Jarque', number: '09777088600' },
] as const;

export const RETREAT_PLANS = [
  { id: 'full', label: 'Full payment', blurb: 'Pay once, save the most.' },
  { id: 'reservation', label: 'Reservation', blurb: 'Lock your slot with a deposit.' },
  {
    id: 'installment',
    label: 'Installment',
    blurb: 'Spread it over 3 months.',
  },
] as const;

export function planLabel(plan: string | undefined): string {
  return RETREAT_PLANS.find((p) => p.id === plan)?.label ?? 'Reservation';
}

/** The amount due *now* for the chosen plan, in centavos. */
export function planAmountCentavos(
  plan: string | undefined,
  c: EventFunnelConfig,
): number {
  const standard = c.standardPriceCentavos ?? 6_000_000;
  const full = c.payInFullPriceCentavos ?? 5_000_000;
  const deposit = c.depositCentavos ?? 1_000_000;
  switch (plan) {
    case 'full':
      return full;
    case 'installment':
      return Math.round(standard / 3);
    case 'reservation':
    default:
      return deposit;
  }
}

/** Human-readable summary of the chosen plan for the payment page. */
export function planSummary(
  plan: string | undefined,
  c: EventFunnelConfig,
): { label: string; dueNow: number; note: string } {
  const standard = c.standardPriceCentavos ?? 6_000_000;
  const full = c.payInFullPriceCentavos ?? 5_000_000;
  const deposit = c.depositCentavos ?? 1_000_000;
  const dueDate = c.balanceDueDate ?? 'the balance date';

  switch (plan) {
    case 'full':
      return {
        label: 'Full payment today',
        dueNow: full,
        note: `One payment — you save ${formatPHP(standard - full)} versus the standard ${formatPHP(standard)}.`,
      };
    case 'installment': {
      const monthly = Math.round(standard / 3);
      return {
        label: 'Installment — 3-month split',
        dueNow: monthly,
        note: `${formatPHP(monthly)} today, then 2 more monthly payments of ${formatPHP(monthly)}.`,
      };
    }
    case 'reservation':
    default:
      return {
        label: 'Reservation',
        dueNow: deposit,
        note: `Secures your slot now. Balance of ${formatPHP(standard - deposit)} due by ${dueDate}.`,
      };
  }
}
