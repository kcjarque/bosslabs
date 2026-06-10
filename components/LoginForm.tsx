'use client';

import { useState } from 'react';

export function LoginForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: fd.get('username'), password: fd.get('password') }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Incorrect password');
      setLoading(false);
      return;
    }
    window.location.href = '/admin';
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="label" htmlFor="username">
          Username <span className="font-normal text-slate-400">(staff only)</span>
        </label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          autoFocus
          className="input"
          placeholder="Leave blank for admin"
        />
      </div>
      <div>
        <label className="label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="input"
          placeholder="••••••••"
        />
      </div>
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      <button type="submit" disabled={loading} className="btn btn-primary w-full">
        {loading ? 'Signing in…' : 'Sign in'}
      </button>
      <p className="text-center text-xs text-slate-500">
        Admins: leave username blank and enter the admin password. Staff: use the
        username + password you were given.
      </p>
    </form>
  );
}
