'use client';

export function CloserLogoutButton() {
  async function logout() {
    await fetch('/api/closer/logout', { method: 'POST' });
    window.location.href = '/closer/login';
  }
  return (
    <button onClick={logout} className="rounded-md px-2 py-1 text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-900">
      Sign out
    </button>
  );
}
