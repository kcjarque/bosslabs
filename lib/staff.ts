/**
 * Staff accounts — scoped admin-panel logins (NOT the shared admin password).
 * Each logs in at /admin/login with a username + password and is limited to the
 * nav sections in `perms` (an allowlist of /admin hrefs). Password hashing
 * reuses the closers' scrypt helpers.
 */
import { getSupabase, isSupabaseConfigured } from './supabase';
import { hashPassword, verifyPassword } from './closers';

export type StaffAccount = {
  id: string;
  name: string;
  username: string;
  perms: string[];
  active: boolean;
};

type StaffRow = {
  id: string;
  name: string;
  username: string;
  password_hash: string | null;
  perms: string[] | null;
  active: boolean;
};

function rowToStaff(r: StaffRow): StaffAccount {
  return { id: r.id, name: r.name, username: r.username, perms: r.perms ?? [], active: r.active };
}

/** Verify a staff login. Returns the account on success, null otherwise. */
export async function verifyStaffLogin(username: string, password: string): Promise<StaffAccount | null> {
  if (!isSupabaseConfigured()) return null;
  const { data } = await getSupabase()
    .from('staff_accounts')
    .select('*')
    .eq('username', username.trim().toLowerCase())
    .maybeSingle();
  if (!data) return null;
  const row = data as StaffRow;
  if (!row.active) return null;
  if (!verifyPassword(password, row.password_hash)) return null;
  return rowToStaff(row);
}

export async function createStaffAccount(input: {
  name: string;
  username: string;
  password: string;
  perms: string[];
}): Promise<StaffAccount> {
  if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
  const { data, error } = await getSupabase()
    .from('staff_accounts')
    .insert({
      name: input.name,
      username: input.username.trim().toLowerCase(),
      password_hash: hashPassword(input.password),
      perms: input.perms,
    })
    .select('*')
    .single();
  if (error) throw new Error(`createStaffAccount: ${error.message}`);
  return rowToStaff(data as StaffRow);
}
