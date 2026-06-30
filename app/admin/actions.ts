'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { requireAdmin } from '@/lib/admin-auth';

/**
 * Manual refresh of the admin dashboard. Busts the 'dashboard' cache tag
 * (which wraps all the heavy KPI fetches — signups, email stats, ad spend,
 * webinar/DFY income, closer-recovered set) and revalidates the path so
 * the next paint hits live data instead of the 60s cache.
 *
 * Page-level fetches that aren't under 'dashboard' (e.g. getSettings) are
 * not cached and don't need busting — they always re-read.
 */
export async function refreshDashboard(): Promise<{ ok: true; at: number }> {
  requireAdmin();
  revalidateTag('dashboard');
  revalidatePath('/admin');
  return { ok: true, at: Date.now() };
}
