import { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminSession } from '@/lib/admin-auth';
import { Mark } from '@/components/Mark';
import { AdminMobileMenu } from '@/components/AdminMobileMenu';
import { LogoutButton } from '@/components/LogoutButton';
import { AdminNavLink } from '@/components/admin/AdminNavLink';
import { CommandPalette } from '@/components/admin/CommandPalette';
import { CommandTrigger } from '@/components/admin/CommandTrigger';
import { PrivacyToggle } from '@/components/admin/PrivacyToggle';
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
type NavItem = { href: string; label: string; icon: string; exact?: boolean };
const NAV_GROUPS: { heading: string; items: NavItem[] }[] = [
  {
    heading: 'Overview',
    items: [{ href: '/admin', label: 'Dashboard', icon: 'dashboard' }],
  },
  {
    heading: 'Audience',
    items: [
      { href: '/admin/customers', label: 'Customers', icon: 'customers' },
      { href: '/admin/lists', label: 'Lists', icon: 'lists' },
      { href: '/admin/events', label: 'Events', icon: 'events' },
    ],
  },
  {
    heading: 'Marketing',
    items: [
      { href: '/admin/ads', label: 'Ads', icon: 'ads' },
      { href: '/admin/funnels', label: 'Funnels', icon: 'funnels' },
      { href: '/admin/sequences', label: 'Sequences', icon: 'sequences' },
      { href: '/admin/templates', label: 'Templates', icon: 'templates' },
      { href: '/admin/messages/email', label: 'Email Logs', icon: 'emaillog' },
      { href: '/admin/messages/sms', label: 'SMS Logs', icon: 'smslog' },
      { href: '/admin/promo-codes', label: 'Promo codes', icon: 'promos' },
      { href: '/admin/affiliates', label: 'Affiliates', icon: 'affiliates' },
      { href: '/admin/closers', label: 'Closers', icon: 'closers' },
    ],
  },
  {
    heading: 'Operations',
    items: [
      { href: '/admin/pending-payments', label: 'Pending payments', icon: 'pending' },
      { href: '/admin/crm', label: 'CRM', icon: 'crm' },
      { href: '/admin/contracts', label: 'Contracts', icon: 'crm' },
      { href: '/admin/ndas', label: 'NDAs', icon: 'crm' },
      { href: '/admin/dfy', label: 'DFY Ops', icon: 'crm' },
      { href: '/admin/recordings', label: 'Recordings', icon: 'recordings' },
      { href: '/admin/capi-status', label: 'CAPI status', icon: 'capi' },
    ],
  },
  {
    heading: 'Finance',
    items: [
      { href: '/admin/finance', label: 'Expenses', icon: 'expenses', exact: true },
      { href: '/admin/finance/pnl', label: 'P&L', icon: 'pnl' },
      { href: '/admin/finance/projects', label: 'Projects', icon: 'projects' },
      { href: '/admin/finance/recurring', label: 'Recurring', icon: 'recurring' },
      { href: '/admin/finance/payables', label: 'Accounts Payable', icon: 'payable' },
      { href: '/admin/finance/settings', label: 'Settings', icon: 'settings' },
    ],
  },
  {
    heading: 'System',
    items: [
      { href: '/admin/settings', label: 'Settings', icon: 'settings' },
      { href: '/admin/hub-backfill', label: 'Hub backfill', icon: 'settings' },
      { href: '/admin/test-thank-you', label: 'QA', icon: 'qa' },
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
  const paletteItems = navGroups.flatMap((g) =>
    g.items.map((i) => ({ href: i.href, label: i.label, icon: i.icon, group: g.heading })),
  );
  const home = isStaff ? session.perms[0] || '/admin' : '/admin';

  return (
    <div className="admin-shell min-h-screen bg-[#F5F7FB] text-slate-900">
      {/* No-flash: apply privacy blur before paint if it was left on. */}
      <script
        dangerouslySetInnerHTML={{
          __html:
            "try{if(localStorage.getItem('bl-privacy')==='1')document.documentElement.classList.add('privacy-on')}catch(e){}",
        }}
      />
      <CommandPalette items={paletteItems} />
      {/* Mobile header (sidebar collapses to drawer below md) */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur md:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <Link href={home} className="inline-flex items-center gap-2 text-slate-900">
            <Mark size={22} />
            <span className="font-semibold tracking-tight">
              BOSSLABS <span className="text-slate-400">/ {isStaff ? 'Staff' : 'Admin'}</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <PrivacyToggle variant="icon" />
            <CommandTrigger variant="icon" />
            <AdminMobileMenu nav={navFlat} />
          </div>
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
          <div className="px-3 pt-3">
            <CommandTrigger />
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-3">
            {navGroups.map((group) => (
              <div key={group.heading} className="mb-4">
                <div className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {group.heading}
                </div>
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <AdminNavLink
                      key={item.href}
                      href={item.href}
                      label={item.label}
                      icon={item.icon}
                      exact={item.exact}
                    />
                  ))}
                </div>
              </div>
            ))}
          </nav>
          <div className="border-t border-slate-200 px-3 py-3">
            <div className="mb-1">
              <PrivacyToggle />
            </div>
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
