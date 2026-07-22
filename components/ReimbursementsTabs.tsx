import Link from 'next/link';

const STAFF_TABS = [
  { id: 'requests', href: '/admin/reimbursements', label: 'My Requests' },
  { id: 'settings', href: '/admin/reimbursements/settings', label: 'My Settings' },
] as const;

const ADMIN_TABS = [
  { id: 'payable', href: '/admin/reimbursements/payable', label: 'Payable' },
  { id: 'payouts', href: '/admin/reimbursements/payouts', label: 'Payout History' },
] as const;

export type ReimbursementsTabId =
  | (typeof STAFF_TABS)[number]['id']
  | (typeof ADMIN_TABS)[number]['id'];

/** Staff only ever see their own submission + settings tabs; admin only ever
 *  sees the pay-out side. Each role has nothing to do on the other's tabs. */
export function ReimbursementsTabs({
  active,
  role,
}: {
  active: ReimbursementsTabId;
  role: 'admin' | 'staff';
}) {
  const tabs = role === 'admin' ? ADMIN_TABS : STAFF_TABS;
  return (
    <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-0.5">
      {tabs.map((t) => {
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
