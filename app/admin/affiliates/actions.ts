'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-auth';
import {
  createAffiliate,
  updateAffiliate,
  markCommissionPaid,
  randomAffiliateCode,
  saveAffiliateProgram,
  getAffiliateProgram,
  type CommissionType,
} from '@/lib/affiliates';
import { setAffiliateAds } from '@/lib/affiliate-ads';
import { getAdsReportCached } from '@/lib/meta-ads';

export async function saveAffiliateProgramAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const cur = await getAffiliateProgram();
  await saveAffiliateProgram({
    ...cur,
    swipeCopy: String(formData.get('swipeCopy') ?? ''),
    assetsUrl: String(formData.get('assetsUrl') ?? '').trim(),
    onePagerUrl: String(formData.get('onePagerUrl') ?? '').trim(),
  });
  revalidatePath('/admin/affiliates');
}

export async function saveAffiliateTiersAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const cur = await getAffiliateProgram();
  await saveAffiliateProgram({
    ...cur,
    tiersEnabled: formData.get('tiersEnabled') === 'on',
    tierMinSales: Math.max(0, Math.round(Number(formData.get('tierMinSales') ?? 0))),
    tierPercent: Math.max(0, Number(formData.get('tierPercent') ?? 0)),
    bonusAtSales: Math.max(0, Math.round(Number(formData.get('bonusAtSales') ?? 0))),
    bonusAmountCentavos: Math.max(0, Math.round(Number(formData.get('bonusAmount') ?? 0) * 100)),
  });
  revalidatePath('/admin/affiliates');
}

export async function createAffiliateAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const name = String(formData.get('name') ?? '').trim();
  // Blank code → opaque random code (never derived from the name, so the
  // referral link doesn't reveal who the affiliate is).
  const code = String(formData.get('code') ?? '').trim() || randomAffiliateCode();
  const email = String(formData.get('email') ?? '').trim();
  const commissionType = (String(formData.get('commissionType') ?? 'percent') as CommissionType);
  const raw = Number(formData.get('commissionValue') ?? 0);
  if (!name) throw new Error('Name is required');
  // Fixed amounts are entered in pesos → stored as centavos. Percent is stored as-is.
  const commissionValue = commissionType === 'fixed' ? Math.round(raw * 100) : raw;
  await createAffiliate({ code, name, email, commissionType, commissionValue });
  revalidatePath('/admin/affiliates');
}

export async function toggleAffiliateAction(formData: FormData): Promise<void> {
  await requireAdmin();
  await updateAffiliate(String(formData.get('id') ?? ''), {
    active: formData.get('active') === '1',
  });
  revalidatePath('/admin/affiliates');
}

export async function markCommissionPaidAction(formData: FormData): Promise<void> {
  await requireAdmin();
  await markCommissionPaid(String(formData.get('id') ?? ''));
  revalidatePath('/admin/affiliates');
}

/** Link the checked Meta ads to an affiliate + save their ad-commission rate.
 *  We resolve ad names from the live (cached) report so each link snapshots a
 *  readable name. */
export async function saveAffiliateAdsAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const affiliateId = String(formData.get('affiliateId') ?? '');
  if (!affiliateId) throw new Error('affiliateId required');
  const adCommissionPercent = Math.max(0, Number(formData.get('adCommissionPercent') ?? 5));
  const checkedIds = formData.getAll('adId').map(String).filter(Boolean);

  const report = await getAdsReportCached('all');
  const nameById = new Map<string, string>();
  if (report.configured) for (const ad of report.ads) nameById.set(ad.id, ad.name);
  const ads = checkedIds.map((adId) => ({ adId, adName: nameById.get(adId) ?? adId }));

  await setAffiliateAds(affiliateId, ads);
  await updateAffiliate(affiliateId, { adCommissionPercent });
  revalidatePath('/admin/affiliates');
}
