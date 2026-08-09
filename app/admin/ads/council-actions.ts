'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-auth';
import { getSupabase } from '@/lib/supabase';
import { getCouncilSettings, saveCouncilSettings } from '@/lib/council/db';
import { runCouncilSession } from '@/lib/council/session';
import { executeAction } from '@/lib/council/executor';
import type { Mode } from '@/lib/council/types';

const MODES: Mode[] = ['recommend', 'one_click', 'autopilot'];

export async function saveCouncilSettingsAction(
  mode: string,
  targetCppCentavos: number,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  if (!MODES.includes(mode as Mode)) return { ok: false, error: 'bad mode' };
  const target = Math.round(targetCppCentavos);
  if (!Number.isFinite(target) || target < 10000 || target > 10_000_000) {
    return { ok: false, error: 'target CPP out of range' };
  }
  const current = await getCouncilSettings('BOSS');
  await saveCouncilSettings({ ...current, mode: mode as Mode, targetCppCentavos: target });
  revalidatePath('/admin/ads');
  return { ok: true };
}

export async function resolvePredictionAction(
  id: string,
  outcome: 'hit' | 'miss' | 'push',
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  if (!['hit', 'miss', 'push'].includes(outcome)) return { ok: false, error: 'bad outcome' };
  const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
  const { error } = await getSupabase()
    .from('council_predictions')
    .update({ outcome, resolved_date: today, needs_manual: false })
    .eq('id', id)
    .is('outcome', null);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/ads');
  return { ok: true };
}

export async function runCouncilNowAction(): Promise<{ ok: boolean; sessionId?: string; error?: string }> {
  await requireAdmin();
  try {
    const { sessionId } = await runCouncilSession('BOSS', ['manual run']);
    revalidatePath('/admin/ads');
    return { ok: true, sessionId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'session failed' };
  }
}

/** Operator-composed execution. Mode is read server-side — never trusted from
 *  the client — so flipping the radio without saving can't enable execution. */
export async function executeVerdictAction(input: {
  type: 'pause_ad' | 'unpause_ad' | 'set_budget';
  targetId: string;
  budgetPesos?: number;
}): Promise<{ ok: boolean; result: string }> {
  await requireAdmin();
  const settings = await getCouncilSettings('BOSS');
  if (settings.mode === 'recommend') {
    return { ok: false, result: 'recommend mode — execution disabled' };
  }
  if (!input.targetId?.trim()) return { ok: false, result: 'no target' };
  const out = await executeAction({
    brand: 'BOSS',
    sessionId: null,
    type: input.type,
    targetId: input.targetId.trim(),
    requestedBudgetCentavos:
      input.type === 'set_budget' && input.budgetPesos ? Math.round(input.budgetPesos * 100) : undefined,
    mode: settings.mode,
    executedBy: 'admin',
  });
  revalidatePath('/admin/ads');
  return out;
}
