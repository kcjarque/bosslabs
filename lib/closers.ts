/**
 * Sales-closer accounts + password hashing.
 *
 * Closers are a distinct, scoped account type (NOT the shared admin). Each
 * logs in at /closer with a username + password (scrypt-hashed). Lead and
 * commission helpers live here too as the subsystem grows.
 */
import crypto from 'crypto';
import { getSupabase, isSupabaseConfigured } from './supabase';

export type Closer = {
  id: string;
  name: string;
  username: string;
  email: string;
  role: string;
  commissionPercent: number;
  active: boolean;
  createdAt: string;
  hasPassword: boolean;
};

type CloserRow = {
  id: string;
  name: string;
  username: string;
  email: string | null;
  password_hash: string | null;
  role: string;
  commission_percent: number | string;
  active: boolean;
  created_at: string;
};

function rowToCloser(r: CloserRow): Closer {
  return {
    id: r.id,
    name: r.name,
    username: r.username,
    email: r.email ?? '',
    role: r.role,
    commissionPercent: Number(r.commission_percent),
    active: r.active,
    createdAt: r.created_at,
    hasPassword: Boolean(r.password_hash),
  };
}

/* ---- password hashing (scrypt, built-in crypto) ------------------- */

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(test, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---- CRUD --------------------------------------------------------- */

export async function listClosers(): Promise<Closer[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await getSupabase()
    .from('closer_accounts')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw new Error(`listClosers: ${error.message}`);
  return (data as CloserRow[]).map(rowToCloser);
}

export async function getCloserById(id: string): Promise<Closer | null> {
  if (!isSupabaseConfigured()) return null;
  const { data } = await getSupabase().from('closer_accounts').select('*').eq('id', id).maybeSingle();
  return data ? rowToCloser(data as CloserRow) : null;
}

/** Verify a login. Returns the closer on success, null otherwise. */
export async function verifyCloserLogin(username: string, password: string): Promise<Closer | null> {
  if (!isSupabaseConfigured()) return null;
  const { data } = await getSupabase()
    .from('closer_accounts')
    .select('*')
    .eq('username', username.trim().toLowerCase())
    .maybeSingle();
  if (!data) return null;
  const row = data as CloserRow;
  if (!row.active) return null;
  if (!verifyPassword(password, row.password_hash)) return null;
  return rowToCloser(row);
}

export async function createCloser(input: {
  name: string;
  username: string;
  email?: string;
  password?: string;
  commissionPercent?: number;
}): Promise<Closer> {
  if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
  const { data, error } = await getSupabase()
    .from('closer_accounts')
    .insert({
      name: input.name.trim(),
      username: input.username.trim().toLowerCase(),
      email: input.email?.trim() || null,
      password_hash: input.password ? hashPassword(input.password) : null,
      commission_percent: input.commissionPercent ?? 20,
    })
    .select('*')
    .single();
  if (error) throw new Error(`createCloser: ${error.message}`);
  return rowToCloser(data as CloserRow);
}

export async function updateCloser(
  id: string,
  patch: { name?: string; email?: string; commissionPercent?: number; active?: boolean; password?: string },
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.email !== undefined) row.email = patch.email.trim() || null;
  if (patch.commissionPercent !== undefined) row.commission_percent = patch.commissionPercent;
  if (patch.active !== undefined) row.active = patch.active;
  if (patch.password) row.password_hash = hashPassword(patch.password);
  if (Object.keys(row).length === 0) return;
  const { error } = await getSupabase().from('closer_accounts').update(row).eq('id', id);
  if (error) throw new Error(`updateCloser: ${error.message}`);
}
