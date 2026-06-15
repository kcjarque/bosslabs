import { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminSession } from '@/lib/admin-auth';
import { Mark } from '@/components/Mark';
import { AdminMobileMenu } from '@/components/AdminMobileMenu';
import { LogoutButton } from '@/components/LogoutButton';
import './admin.css';

export const metadata = { title: 'Admin · BOSSLABS AI' };

/**
 * Grouped left-sidebar nav. The flat list got too long once we added
 * recordings + the email sequence engine, so sections are clustered by
 * intent: Overview / Audience / Marketing / Operations / Settings.
 *
 * AdminMobileMenu uses a flat list (drawer pattern), so we also derive
 * a flat NAV_FLAT array from the groups for the mobile menu.
 */
const NAV_GROUPS: { heading: string; items: { href: string; label: string }[] }[] = [
  {
    heading: 'Overview',
    items: [
      { href: '/admin', label: 'Dashboard' },
    ],
  },
  {
    heading: 'Audience',
    items: [
      { href: '/admin/customers', label: 'Customers' },
      { href: '/admin/lists', label: 'Lists' },
      { href: '/admin/events', label: 'Events' },
    ],
  },
  {
    heading: 'Marketing',
    items: [
      { href: '/admin/ads', label: 'Ads' },
      { href: '/admin/funnels', label: 'Funnels' },
      { href: '/admin/sequences', label: 'Sequences' },
      { href: '/admin/templates', label: 'Templates' },
      { href: '/admin/promo-codes', label: 'Promo codes' },
      { href: '/admin/affiliates', label: 'Affiliates' },
      { href: '/admin/closers', label: 'Closers' },
    ],
  },
  {
    heading: 'Operations',
    items: [
      { href: '/admin/pending-payments', label: 'Pending payments' },
      { href: '/admin/crm', label: 'Order-bump CRM' },
      { href: '/admin/retreat-crm', label: 'Retreat CRM' },
      { href: '/admin/recordings', label: 'Recordings' },
      { href: '/admin/capi-status', label: 'CAPI status' },
    ],
  },
  {
    heading: 'System',
    items: [
      { href: '/admin/settings', label: 'Settings' },
      { href: '/admin/test-thank-you', label: 'QA' },
    ],
  },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const session = getAdminSession();

  if (!session) {
    return (
      <div className="admin-shell min-h-screen bg-[#F5F7FB] text-slate-900">
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">{children}</main>
      </div>
    );
  }

  const isStaff = session.role === 'staff';
  const pathname = headers().get('x-pathname') || '';

  // Staff are limited to their allowed sections. Block direct navigation to
  // anything else (not just hide the nav link). Admin is never gated.
  if (isStaff && pathname.startsWith('/admin') && pathname !== '/admin/login') {
    const allowed = session.perms.some(
      (h) => pathname === h || pathname.startsWith(h + '/'),
    );
    if (!allowed) redirect(session.perms[0] || '/admin/login');
  }

  // Nav scoped to the session's perms (admin sees everything).
  const navGroups = isStaff
    ? NAV_GROUPS.map((g) => ({
        ...g,
        items: g.items.filter((i) => session.perms.includes(i.href)),
      })).filter((g) => g.items.length > 0)
    : NAV_GROUPS;
  const navFlat = navGroups.flatMap((g) => g.items);
  const home = isStaff ? session.perms[0] || '/admin' : '/admin';

  return (
    <div className="admin-shell min-h-screen bg-[#F5F7FB] text-slate-900">
      {/* Mobile header (sidebar collapses to drawer below md) */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur md:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <Link href={home} className="inline-flex items-center gap-2 text-slate-900">
            <Mark size={22} />
            <span className="font-semibold tracking-tight">
              BOSSLABS <span className="text-slate-400">/ {isStaff ? 'Staff' : 'Admin'}</span>
            </span>
          </Link>
          <AdminMobileMenu nav={navFlat} />
        </div>
      </header>

      <div className="md:flex">
        {/* Desktop sidebar — explicit left:0 in case a browser interprets
            `fixed inset-y-0` (which only sets top+bottom) ambiguously. */}
        <aside className="hidden border-r border-slate-200 bg-white md:flex md:w-60 md:flex-col md:fixed md:inset-y-0 md:left-0">
          <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-5">
            <Mark size={22} />
            <Link href={home} className="font-semibold tracking-tight text-slate-900">
              BOSSLABS <span className="text-slate-400">/ {isStaff ? 'Staff' : 'Admin'}</span>
            </Link>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-4">
            {navGroups.map((group) => (
              <div key={group.heading} className="mb-4">
                <div className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {group.heading}
                </div>
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="block rounded-md px-2 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </nav>
          <div className="border-t border-slate-200 px-3 py-3">
            <div className="px-2 pb-1 text-[11px] text-slate-400">
              Signed in as <span className="font-medium text-slate-600">{session.name}</span>
              {isStaff ? ' · staff' : ''}
            </div>
            <Link
              href="/"
              target="_blank"
              className="block rounded-md px-2 py-1.5 text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            >
              View site ↗
            </Link>
            <div className="mt-1">
              <LogoutButton />
            </div>
          </div>
        </aside>

        {/* min-w-0 is critical: by default flex items have min-width:auto,
            meaning they can't shrink below their content's natural size.
            Without min-w-0, a wide child (like the signups table) blows
            the main element past the viewport edge. */}
        <main className="min-w-0 flex-1 md:ml-60">
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">{children}</div>
        </main>
      </div>
    </div>
  );
}
