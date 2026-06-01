import { ReactNode } from 'react';
import Link from 'next/link';
import { getCloserSession } from '@/lib/closer-auth';
import { Mark } from '@/components/Mark';
import { CloserLogoutButton } from '@/components/CloserLogoutButton';
import '../admin/admin.css';

export const metadata = { title: 'Closer · BOSSLABS' };

const NAV = [
  { href: '/closer', label: 'Leads' },
  { href: '/closer/commissions', label: 'Commissions' },
];

export default async function CloserLayout({ children }: { children: ReactNode }) {
  const closer = await getCloserSession();

  if (!closer) {
    // Login page (and any unauthenticated view) renders plain inside the shell.
    return (
      <div className="admin-shell min-h-screen bg-[#F5F7FB] text-slate-900">
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">{children}</main>
      </div>
    );
  }

  return (
    <div className="admin-shell min-h-screen bg-[#F5F7FB] text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <Link href="/closer" className="inline-flex items-center gap-2 text-slate-900">
            <Mark size={22} />
            <span className="font-semibold tracking-tight">
              BOSSLABS <span className="text-slate-400">/ Closer</span>
            </span>
          </Link>
          <nav className="flex items-center gap-1">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="rounded-md px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm text-slate-500">
            <span className="font-medium text-slate-700">{closer.name}</span>
            <CloserLogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
