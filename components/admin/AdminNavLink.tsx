'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NavIcon } from './NavIcon';

/**
 * Sidebar nav link with CLIENT-side active state. The admin layout is a server
 * component and Next.js doesn't re-render layouts on client navigation, so a
 * server-computed active state goes stale until a full refresh. usePathname()
 * updates on every client navigation, so the highlight follows instantly.
 */
export function AdminNavLink({
  href,
  label,
  icon,
  exact,
}: {
  href: string;
  label: string;
  icon: string;
  exact?: boolean;
}) {
  const pathname = usePathname();
  const active = exact
    ? pathname === href
    : pathname === href || (href !== '/admin' && pathname.startsWith(href + '/'));
  return (
    <Link
      href={href}
      style={{ color: active ? '#0e7490' : '#475569' }}
      className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition ${
        active ? 'bg-cyan-50 font-medium' : 'hover:bg-slate-100'
      }`}
    >
      <NavIcon name={icon} />
      {label}
    </Link>
  );
}
