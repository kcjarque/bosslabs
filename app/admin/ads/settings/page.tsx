import { requireAdmin } from '@/lib/admin-auth';
import { getTrackedCampaigns } from '@/lib/db';
import { getAccountCampaigns } from '@/lib/meta-ads';
import { CampaignSettingsForm } from './CampaignSettingsForm';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

function AdsTabs() {
  const tabs = [
    { key: 'live', label: 'Live (Meta)', href: '/admin/ads' },
    { key: 'results', label: 'Results over time', href: '/admin/ads?view=results' },
    { key: 'settings', label: 'Settings', href: '/admin/ads/settings' },
  ];
  return (
    <div className="flex flex-wrap gap-2 border-b border-slate-200">
      {tabs.map((t) => {
        const active = t.key === 'settings';
        return (
          <Link
            key={t.key}
            href={t.href}
            className={`-mb-px rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition ${
              active
                ? 'border-cyan-600 text-cyan-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

export default async function AdsSettingsPage() {
  await requireAdmin();

  const [accountCampaigns, savedCampaigns] = await Promise.all([
    getAccountCampaigns(),
    getTrackedCampaigns(),
  ]);

  // Merge: account campaigns are authoritative for name + status; saved
  // campaigns carry the tracked boolean. Any saved campaign not in the Meta
  // list is included so nothing disappears silently.
  const savedMap = new Map(savedCampaigns.map((c) => [c.campaignId, c]));
  const merged = accountCampaigns.map((c) => ({
    campaignId: c.id,
    campaignName: c.name,
    status: c.status,
    tracked: savedMap.get(c.id)?.tracked ?? false,
  }));
  // Add any saved campaigns that no longer appear in the account list.
  for (const s of savedCampaigns) {
    if (!merged.find((m) => m.campaignId === s.campaignId)) {
      merged.push({ campaignId: s.campaignId, campaignName: s.campaignName, status: 'UNKNOWN', tracked: s.tracked });
    }
  }

  const configured = accountCampaigns.length > 0 || savedCampaigns.length > 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Ads</h1>
      </header>

      <AdsTabs />

      <div className="max-w-2xl space-y-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Tracked campaigns</h2>
          <p className="mt-1 text-sm text-slate-500">
            Check the campaigns to include in the <strong>Ad spend &amp; ROAS</strong> dashboard.
            Spend is summed across all checked campaigns on each day.
          </p>
        </div>

        {!configured ? (
          <div className="rounded-xl border-2 border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
            Add <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">META_ADS_TOKEN</code> to
            the environment to load your campaigns.
          </div>
        ) : (
          <CampaignSettingsForm campaigns={merged} />
        )}
      </div>
    </div>
  );
}
