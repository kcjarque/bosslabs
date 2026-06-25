import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import { CrmBoard } from '@/components/CrmBoard';
import { DfyBoard } from '@/components/DfyBoard';
import { RetreatCrmBoard } from '@/components/RetreatCrmBoard';
import { VipBoard } from '@/components/VipBoard';
import { BootcampCrmBoard } from '@/components/admin/BootcampCrmBoard';
import { PageHeader } from '@/components/admin/PageHeader';
import { listBootcampCards } from '@/lib/bootcamp-crm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'CRM · BOSSLABS AI' };

const TABS = [
  {
    key: 'order-bump',
    label: 'Order-bump',
    subtitle:
      'Customers who took the order bump (OTO), each with the total they paid. Drag across stages and Text them from your phone.',
  },
  {
    key: 'dfy',
    label: 'DFY',
    subtitle:
      'Your Done-For-You pipeline: Discovery Call → Contract Sent → Follow Up → Contract Signing → Onboarding.',
  },
  {
    key: 'retreat',
    label: 'Retreat',
    subtitle:
      'VibeCode Retreat leads — interested → paid. Set a deal amount, log payments, and track Webinar income.',
  },
  {
    key: 'vip',
    label: 'VIP',
    subtitle:
      'Your VIP watchlist — people worth tracking for future projects. Tag them, jot why, and keep their contact one tap away.',
  },
  {
    key: 'bootcamp',
    label: 'Bootcamp',
    subtitle:
      "AI Founder's Bootcamp pipeline — reservations, paid seats, attended, lost leads. Drag across stages, edit headcount, jot notes.",
  },
] as const;

export default async function CrmPage({ searchParams }: { searchParams: { board?: string } }) {
  requireAdmin();
  const active = TABS.find((t) => t.key === searchParams.board) ?? TABS[0];
  // Bootcamp board is server-rendered with its initial cards (matches the
  // /admin/bootcamp pattern). Only fetched when its tab is active so the
  // other tabs don't pay the Supabase round-trip.
  const bootcampCards = active.key === 'bootcamp' ? await listBootcampCards() : [];

  return (
    <div>
      <PageHeader title="CRM" subtitle={active.subtitle} />

      {/* Board switcher — only the active board mounts (one data fetch, not three) */}
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => {
          const isOn = t.key === active.key;
          return (
            <Link
              key={t.key}
              href={`/admin/crm?board=${t.key}`}
              scroll={false}
              style={{ color: isOn ? '#0e7490' : '#64748b' }}
              className={`relative whitespace-nowrap px-3.5 py-2 text-sm font-medium transition ${
                isOn ? '' : 'hover:text-slate-900'
              }`}
            >
              {t.label}
              {isOn && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-cyan-500" />}
            </Link>
          );
        })}
      </div>

      {active.key === 'order-bump' && <CrmBoard />}
      {active.key === 'dfy' && <DfyBoard />}
      {active.key === 'retreat' && <RetreatCrmBoard />}
      {active.key === 'vip' && <VipBoard />}
      {active.key === 'bootcamp' && <BootcampCrmBoard initialCards={bootcampCards} />}
    </div>
  );
}
