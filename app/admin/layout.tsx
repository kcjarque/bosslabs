import { ReactNode } from 'react';
import Link from 'next/link';
import { isAdminLoggedIn } from '@/lib/admin-auth';
import { Mark } from '@/components/Mark';
import { AdminMobileMenu } from '@/components/AdminMobileMenu';
import { LogoutButton } from '@/components/LogoutButton';
import './admin.css';

export const metadata = { title: 'Admin · BOSSLABS AI' };

const NAV = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/signups', label: 'Signups' },
  { href: '/admin/email-templates', label: 'Email' },
  { href: '/admin/sms-templates', label: 'SMS' },
  { href: '/admin/settings', label: 'Settings' },
  { href: '/admin/test-thank-you', label: 'QA' },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const loggedIn = isAdminLoggedIn();

  return (
    <div className="admin-shell min-h-screen bg-[#F5F7FB] text-slate-900">
      {loggedIn && (
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:h-16 sm:px-6">
            <Link href="/admin" className="inline-flex items-center gap-2 text-slate-900">
              <Mark size={22} />
              <span className="font-semibold tracking-tight">
                BOSSLABS <span className="text-slate-400">/ Admin</span>
              </span>
            </Link>

            {/* Desktop nav */}
            <nav className="hidden items-center gap-1 md:flex">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                >
                  {item.label}
                </Link>
              ))}
              <div className="mx-2 h-5 w-px bg-slate-200" />
              <Link
                href="/"
                target="_blank"
                className="rounded-md px-3 py-1.5 text-sm text-slate-500 transition hover:text-slate-900"
              >
                View site ↗
              </Link>
              <LogoutButton />
            </nav>

            {/* Mobile menu */}
            <AdminMobileMenu nav={NAV} />
          </div>
        </header>
      )}

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}
