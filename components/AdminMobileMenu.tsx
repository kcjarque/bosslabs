'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { NavIcon } from '@/components/admin/NavIcon';

export function AdminMobileMenu({
  nav,
}: {
  nav: { href: string; label: string; icon?: string }[];
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname() || '';
  const isActive = (href: string) =>
    pathname === href || (href !== '/admin' && pathname.startsWith(href + '/'));

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST' });
    window.location.href = '/admin/login';
  }

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label="Open admin menu"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path
            d="M4 6h16M4 12h16M4 18h16"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-20 bg-slate-900/30"
          />
          <div className="absolute right-4 top-14 z-30 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
            {nav.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  style={{ color: active ? '#0e7490' : '#475569' }}
                  className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm ${
                    active ? 'bg-cyan-50 font-medium' : 'hover:bg-slate-100'
                  }`}
                >
                  {item.icon && <NavIcon name={item.icon} />}
                  {item.label}
                </Link>
              );
            })}
            <div className="my-1 h-px bg-slate-100" />
            <Link
              href="/"
              target="_blank"
              onClick={() => setOpen(false)}
              className="block rounded-md px-3 py-2 text-sm text-slate-500 hover:bg-slate-100"
            >
              View site ↗
            </Link>
            <button
              type="button"
              onClick={logout}
              className="block w-full rounded-md px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
            >
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
