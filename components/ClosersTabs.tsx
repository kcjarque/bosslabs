import Link from 'next/link';

const TABS = [
  { id: 'assignments', href: '/admin/closers', label: 'Assignments' },
  { id: 'commissions', href: '/admin/closers/commissions', label: 'Commissions' },
  { id: 'payouts', href: '/admin/closers/payouts', label: 'Payout History' },
  { id: 'settings', href: '/admin/closers/settings', label: 'Settings' },
] as const;

export type ClosersTabId = (typeof TABS)[number]['id'];

export function ClosersTabs({ active }: { active: ClosersTabId }) {
  return (
    <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-0.5">
      {TABS.map((t) => {
        const isActive = t.id === active;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`rounded-full px-4 py-1 text-xs font-medium transition ${
              isActive
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-white hover:text-slate-900'
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
