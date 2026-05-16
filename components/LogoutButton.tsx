'use client';

export function LogoutButton() {
  async function onLogout() {
    await fetch('/api/admin/logout', { method: 'POST' });
    window.location.href = '/admin/login';
  }
  return (
    <button
      type="button"
      onClick={onLogout}
      className="rounded-md px-3 py-1.5 text-sm text-slate-500 transition hover:text-red-600"
    >
      Sign out
    </button>
  );
}
