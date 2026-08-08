'use client';

import { useState } from 'react';
import type { CreativeBrief } from '@/lib/council/creative-context';

/** Ads-table Creative column: a canonical tag pill that, on hover, reveals a
 *  card with the ad's creative context (format/angle/persona/hook/quality).
 *  The full transcript stays one click away in the Advise drawer. */

const TAG_STYLE: Record<string, string> = {
  Testimonial: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  'Talking Head': 'bg-sky-50 text-sky-700 ring-sky-600/20',
  Walkthrough: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  'Problem-Based': 'bg-amber-50 text-amber-700 ring-amber-600/20',
  'Income Claim': 'bg-yellow-50 text-yellow-800 ring-yellow-600/20',
  Objection: 'bg-orange-50 text-orange-700 ring-orange-600/20',
  Urgency: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  Graphic: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  Other: 'bg-slate-100 text-slate-500 ring-slate-500/20',
};

export function CreativeTagCell({ brief }: { brief: CreativeBrief | null }) {
  const [hover, setHover] = useState(false);
  if (!brief) return <span className="text-[11px] text-slate-300">—</span>;

  const meta = [brief.format, brief.persona, brief.awarenessLevel]
    .map((s) => s.replace(/-/g, ' '))
    .filter(Boolean);

  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span
        className={`inline-flex cursor-default items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
          TAG_STYLE[brief.creativeTag] ?? TAG_STYLE.Other
        }`}
      >
        {brief.creativeTag}
      </span>

      {hover && (
        <span className="absolute left-0 top-full z-50 mt-1 block w-64 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-xl">
          <span className="block text-[10px] font-medium uppercase tracking-[0.06em] text-slate-400">
            Creative context
          </span>
          {meta.length > 0 && (
            <span className="mt-1 block text-[11px] capitalize text-slate-600">{meta.join(' · ')}</span>
          )}
          {brief.hook && (
            <span className="mt-1.5 block text-[12px] italic leading-snug text-slate-700">
              &ldquo;{brief.hook}&rdquo;
            </span>
          )}
          <span className="mt-2 flex flex-wrap items-center gap-1.5">
            {brief.visualQuality != null && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                quality {brief.visualQuality}/5
              </span>
            )}
            {brief.onBrand === true && (
              <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">on-brand</span>
            )}
            {brief.onBrand === false && (
              <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] text-rose-700">off-brand</span>
            )}
          </span>
          {brief.tags.length > 0 && (
            <span className="mt-1.5 block text-[10px] text-slate-400">
              {brief.tags.slice(0, 6).map((t) => `#${t.replace(/\s+/g, '')}`).join(' ')}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
