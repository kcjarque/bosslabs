import Link from 'next/link';

const TABS = [
  { href: '/admin/closers', label: 'Assignments' },
  { href: '/admin/closers/settings', label: 'Settings' },
];

export function ClosersTabs({ active }: { active: 'assignments' | 'settings' }) {
  return (
    <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-0.5">
      {TABS.map((t) => {
        const isActive = (active === 'assignments') === (t.href === '/admin/closers');
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
