'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { requireAdmin } from '@/lib/admin-auth';
import { syncAdSpendDaily } from '@/lib/meta-ads';
import { getTrackedCampaigns, saveTrackedCampaigns } from '@/lib/db';

export async function refreshAdsData(): Promise<{ ok: boolean; synced: number; error?: string }> {
  requireAdmin();
  const tracked = await getTrackedCampaigns();
  const campaignIds = tracked.filter((c) => c.tracked).map((c) => c.campaignId);
  const result = await syncAdSpendDaily(7, campaignIds);
  revalidateTag('ads-report');
  revalidatePath('/admin/ads');
  revalidatePath('/admin');
  return { ok: !result.error, synced: result.synced.length, error: result.error };
}

export async function saveTrackedCampaignsAction(
  campaigns: { campaignId: string; campaignName: string; tracked: boolean }[],
): Promise<{ ok: boolean }> {
  requireAdmin();
  await saveTrackedCampaigns(campaigns);
  revalidateTag('ads-report');
  revalidatePath('/admin/ads');
  revalidatePath('/admin');
  return { ok: true };
}
