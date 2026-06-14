'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-auth';
import { syncAdSpendDaily } from '@/lib/meta-ads';

/**
 * On-demand refresh of the stored daily ad spend (ad_spend_daily). Re-pulls a
 * 7-day window from Meta and overwrites each day, so a previously partial day
 * (e.g. today, or a yesterday synced before midnight) is corrected to the full
 * day's total. The live Ads tab is already real-time; this keeps the ROAS
 * dashboard's stored history current + accurate.
 */
export async function refreshAdsData(): Promise<{ ok: boolean; synced: number; error?: string }> {
  requireAdmin();
  const result = await syncAdSpendDaily(7);
  revalidatePath('/admin/ads');
  revalidatePath('/admin');
  return { ok: !result.error, synced: result.synced.length, error: result.error };
}
