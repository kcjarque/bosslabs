import { saveAffiliateAdsAction } from '@/app/admin/affiliates/actions';

export type AdPickItem = {
  id: string;
  name: string;
  active: boolean;
  thumbnailUrl?: string | null;
  impressions: number;
  revenue: number;
};

/**
 * Collapsible per-affiliate ad picker + rate editor (server component, native
 * form → saveAffiliateAdsAction). Admins check the Meta ads that belong to this
 * affiliate; those ads' impressions + pixel revenue then power the affiliate's
 * dashboard, with commission at the rate set here.
 */
export function AffiliateAdManager({
  affiliateId,
  adCommissionPercent,
  ads,
  linkedAdIds,
  takenByOther,
}: {
  affiliateId: string;
  adCommissionPercent: number;
  ads: AdPickItem[];
  linkedAdIds: string[];
  /** adId → names of OTHER affiliates already linked to it (informational). */
  takenByOther: Record<string, string[]>;
}) {
  const linked = new Set(linkedAdIds);

  return (
    <details className="mt-4 rounded-lg border border-slate-200 bg-slate-50/60">
      <summary className="cursor-pointer select-none px-3 py-2 text-[13px] font-medium text-slate-700">
        Ads — <strong>{linkedAdIds.length}</strong> linked · {adCommissionPercent}% commission
      </summary>
      <form action={saveAffiliateAdsAction} className="space-y-3 border-t border-slate-200 px-3 py-3">
        <input type="hidden" name="affiliateId" value={affiliateId} />
        <label className="flex items-center gap-2 text-[12px] text-slate-600">
          Ad-earnings commission
          <input
            name="adCommissionPercent"
            type="number"
            step="0.5"
            min="0"
            defaultValue={adCommissionPercent}
            className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-cyan-400 focus:outline-none"
          />
          %
        </label>

        {ads.length === 0 ? (
          <p className="text-[12px] text-slate-400">
            No ads available — the Meta token isn&rsquo;t configured or the campaign has no ads.
          </p>
        ) : (
          <div className="max-h-72 space-y-0.5 overflow-y-auto rounded-md border border-slate-200 bg-white p-1">
            {ads.map((ad) => {
              const others = takenByOther[ad.id] ?? [];
              return (
                <label
                  key={ad.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[12.5px] hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    name="adId"
                    value={ad.id}
                    defaultChecked={linked.has(ad.id)}
                    className="h-4 w-4 flex-none"
                  />
                  {ad.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ad.thumbnailUrl} alt="" className="h-8 w-8 flex-none rounded object-cover" />
                  ) : (
                    <div className="h-8 w-8 flex-none rounded bg-slate-100" />
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium text-slate-800">{ad.name}</span>
                    <span className="ml-1 text-slate-400">
                      · {ad.impressions.toLocaleString()} views · ₱{Math.round(ad.revenue).toLocaleString()}
                    </span>
                    {others.length > 0 && (
                      <span className="ml-1 text-amber-600">· also {others.join(', ')}</span>
                    )}
                  </span>
                  <span className={`pill text-[10px] ${ad.active ? 'pill-green' : ''}`}>
                    {ad.active ? 'Active' : 'Off'}
                  </span>
                </label>
              );
            })}
          </div>
        )}

        <button type="submit" className="btn btn-primary text-xs">
          Save ads + rate
        </button>
      </form>
    </details>
  );
}
