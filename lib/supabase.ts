/**
 * Supabase server-side client.
 *
 * Always uses the service-role key, so Row Level Security is bypassed and
 * every signups / templates / settings read+write works without policy juggling.
 * The key is server-only — never imported into a client component.
 *
 * If env vars are missing, `getSupabase()` throws so callers can fall back to
 * the JSON file storage (see lib/db.ts for the switching logic).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

export function getSupabase(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Supabase env vars missing — set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
    );
  }
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      // Next.js patches global fetch to cache responses in its Data Cache by
      // default. That made server reads serve STALE rows after a write — e.g.
      // the homepage kept showing the old webinar date after Settings changed.
      // Force no-store so DB reads are always fresh; per-request dedup is still
      // handled by React cache() in lib/db.ts.
      fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
    },
  });
  return _client;
}
