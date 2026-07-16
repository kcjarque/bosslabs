'use client';

import { useState } from 'react';
import { saveTrackedCampaignsAction } from '../actions';

type CampaignRow = {
  campaignId: string;
  campaignName: string;
  status: string;
  tracked: boolean;
};

export function CampaignSettingsForm({ campaigns }: { campaigns: CampaignRow[] }) {
  const [state, setState] = useState<CampaignRow[]>(campaigns);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function toggle(id: string) {
    setState((prev) =>
      prev.map((c) => (c.campaignId === id ? { ...c, tracked: !c.tracked } : c)),
    );
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    await saveTrackedCampaignsAction(state);
    setSaving(false);
    setSaved(true);
  }

  const active = state.filter((c) => c.status === 'ACTIVE' || c.status === 'UNKNOWN');
  const inactive = state.filter((c) => c.status !== 'ACTIVE' && c.status !== 'UNKNOWN');

  return (
    <div className="space-y-4">
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {active.map((c) => (
          <CampaignRow key={c.campaignId} campaign={c} onToggle={toggle} />
        ))}
        {inactive.length > 0 && active.length > 0 && (
          <div className="px-4 py-2 text-[10px] uppercase tracking-[0.08em] text-slate-400 bg-slate-50">
            Inactive / paused
          </div>
        )}
        {inactive.map((c) => (
          <CampaignRow key={c.campaignId} campaign={c} onToggle={toggle} />
        ))}
        {state.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-slate-400">
            No campaigns found in this ad account.
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {saved && (
          <span className="text-sm text-emerald-600">
            ✓ Saved — next refresh will pull all tracked campaigns
          </span>
        )}
      </div>

      <p className="text-xs text-slate-400">
        Spend is summed across all checked campaigns per day in the Ad spend &amp; ROAS dashboard.
        The nightly cron and Refresh button sync all checked campaigns automatically.
      </p>
    </div>
  );
}

function CampaignRow({
  campaign,
  onToggle,
}: {
  campaign: CampaignRow;
  onToggle: (id: string) => void;
}) {
  const isActive = campaign.status === 'ACTIVE';
  return (
    <label className="flex cursor-pointer items-center gap-4 px-4 py-3.5 hover:bg-slate-50">
      <input
        type="checkbox"
        checked={campaign.tracked}
        onChange={() => onToggle(campaign.campaignId)}
        className="h-4 w-4 rounded border-slate-300 accent-cyan-600"
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-slate-900">{campaign.campaignName}</div>
        <div className="mt-0.5 text-[11px] text-slate-400">{campaign.campaignId}</div>
      </div>
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
          isActive
            ? 'bg-emerald-50 text-emerald-700'
            : 'bg-slate-100 text-slate-500'
        }`}
      >
        {campaign.status === 'UNKNOWN' ? '—' : campaign.status.toLowerCase()}
      </span>
    </label>
  );
}
