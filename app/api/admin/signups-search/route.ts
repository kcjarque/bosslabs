/**
 * GET /api/admin/signups-search?q=<query>
 *
 * Typeahead for the contract maker's "Link to customer" picker. Returns up
 * to 12 signups matching by email OR first/last name. Admin-cookie gated.
 */
import { NextResponse } from 'next/server';
import { isAdminLoggedIn, isSameOrigin } from '@/lib/admin-auth';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

export const runtime = 'nodejs';

type SignupHit = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
};

export async function GET(req: Request) {
  if (!isAdminLoggedIn()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!isSupabaseConfigured()) return NextResponse.json({ hits: [] });

  const q = (new URL(req.url).searchParams.get('q') || '').trim();
  if (q.length < 2) return NextResponse.json({ hits: [] });

  const sb = getSupabase();
  const pat = `%${q}%`;
  // .or() takes a comma-separated filter list — match across email + name.
  const { data, error } = await sb
    .from('signups')
    .select('id, first_name, last_name, email, status')
    .or(`email.ilike.${pat},first_name.ilike.${pat},last_name.ilike.${pat}`)
    .order('created_at', { ascending: false })
    .limit(12);
  if (error) return NextResponse.json({ hits: [], error: error.message }, { status: 500 });

  const hits: SignupHit[] = (data ?? []).map((r) => ({
    id: r.id,
    firstName: r.first_name ?? '',
    lastName: r.last_name ?? '',
    email: r.email ?? '',
    status: r.status ?? '',
  }));
  return NextResponse.json({ hits });
}
