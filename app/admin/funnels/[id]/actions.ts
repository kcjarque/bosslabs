'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-auth';
import { getFunnel, updateFunnel, type EventFunnelConfig } from '@/lib/db';
import {
  readAbTest,
  readAbHistory,
  type AbHistoryEntry,
  type VariantKey,
} from '@/lib/ab';
import { getAbResults } from '@/lib/ab-stats';

export async function updateFunnelAction(
  id: string,
  patch: {
    name?: string;
    active?: boolean;
    config?: EventFunnelConfig & Record<string, unknown>;
  },
): Promise<void> {
  await requireAdmin();
  await updateFunnel(id, patch);
  revalidatePath('/admin/funnels');
  revalidatePath(`/admin/funnels/${id}`);
}

/* ── Homepage A/B test controls ─────────────────────────────────────────── */

/** Persist an abTest patch (and optionally push a history entry). */
async function saveAbTest(
  id: string,
  mutate: (
    current: ReturnType<typeof readAbTest>,
    history: AbHistoryEntry[],
  ) => { abTest: ReturnType<typeof readAbTest>; abHistory: AbHistoryEntry[] },
): Promise<void> {
  await requireAdmin();
  const funnel = await getFunnel(id);
  if (!funnel) throw new Error('Funnel not found');
  const config = (funnel.config ?? {}) as Record<string, unknown>;
  const { abTest, abHistory } = mutate(readAbTest(config), readAbHistory(config));
  await updateFunnel(id, {
    config: { ...config, abTest, abHistory } as EventFunnelConfig & Record<string, unknown>,
  });
  revalidatePath('/admin/funnels');
  revalidatePath(`/admin/funnels/${id}`);
  revalidatePath('/'); // the homepage router reads this config
}

/** Change the traffic ratio on a running test. */
export async function updateAbSplitAction(id: string, splitAPct: number): Promise<void> {
  const pct = Math.min(100, Math.max(0, Math.round(splitAPct) || 0));
  await saveAbTest(id, (cur, history) => ({
    abTest: { ...cur, splitAPct: pct },
    abHistory: history,
  }));
}

/**
 * Start a NEW test with the chosen two designs. Any running test is archived
 * to history first (with its results snapshotted) so nothing is lost.
 */
export async function startAbTestAction(
  id: string,
  variantA: VariantKey,
  variantB: VariantKey,
  splitAPct: number,
): Promise<void> {
  const pct = Math.min(100, Math.max(0, Math.round(splitAPct) || 50));
  const funnel = await getFunnel(id);
  const current = readAbTest((funnel?.config ?? {}) as Record<string, unknown>);

  // Snapshot the outgoing test so the history row keeps its real numbers.
  let snapshot: AbHistoryEntry['result'] = null;
  try {
    const r = await getAbResults(current);
    snapshot = {
      aPaid: r.a.customers,
      bPaid: r.b.customers,
      aRevenueCentavos: r.a.revenueCentavos,
      bRevenueCentavos: r.b.revenueCentavos,
      aConvPct: r.a.convPct,
      bConvPct: r.b.convPct,
    };
  } catch {
    /* snapshot is best-effort */
  }

  await saveAbTest(id, (cur, history) => ({
    abTest: {
      status: 'running',
      variantA,
      variantB,
      splitAPct: pct,
      startedAt: new Date().toISOString(),
      endedAt: null,
      winner: null,
    },
    abHistory: [
      { ...cur, endedAt: cur.endedAt ?? new Date().toISOString(), result: snapshot },
      ...history,
    ].slice(0, 30),
  }));
}

/**
 * Stop the running test and declare a winner. The winning design is then
 * served to 100% of visitors, and attribution stops mattering (the numbers
 * already live in the dashboard + this test's history row).
 */
export async function stopAbTestAction(id: string, winner: 'a' | 'b'): Promise<void> {
  const funnel = await getFunnel(id);
  const current = readAbTest((funnel?.config ?? {}) as Record<string, unknown>);

  let snapshot: AbHistoryEntry['result'] = null;
  try {
    const r = await getAbResults(current);
    snapshot = {
      aPaid: r.a.customers,
      bPaid: r.b.customers,
      aRevenueCentavos: r.a.revenueCentavos,
      bRevenueCentavos: r.b.revenueCentavos,
      aConvPct: r.a.convPct,
      bConvPct: r.b.convPct,
    };
  } catch {
    /* snapshot is best-effort */
  }

  const endedAt = new Date().toISOString();
  await saveAbTest(id, (cur, history) => ({
    abTest: { ...cur, status: 'stopped' as const, endedAt, winner },
    abHistory: [
      { ...cur, status: 'stopped' as const, endedAt, winner, result: snapshot },
      ...history,
    ].slice(0, 30),
  }));
}
