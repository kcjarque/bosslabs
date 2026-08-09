import { NextResponse, type NextRequest } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { getAdminSession, isSameOrigin } from '@/lib/admin-auth';

const OPS_URL = process.env.BOSSLABS_OPS_URL ?? 'https://bosslabs-ops.vercel.app';
const OPS_TOKEN = process.env.BOSSLABS_OPS_TOKEN ?? '';

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { cardId } = (await req.json()) as { cardId?: string };
  if (!cardId || !/^[a-zA-Z0-9_-]{1,128}$/.test(cardId)) {
    return NextResponse.json({ error: 'valid cardId required' }, { status: 400 });
  }
  if (!OPS_TOKEN) return NextResponse.json({ error: 'BOSSLABS_OPS_TOKEN not configured' }, { status: 500 });

  const sb = getSupabase();
  const { data: card, error } = await sb
    .from('dfy_crm_cards')
    .select('id, name, phone, email, note, amount_centavos, retainer_centavos, external_ops_url')
    .eq('id', cardId)
    .maybeSingle();
  if (error || !card) return NextResponse.json({ error: 'Card not found' }, { status: 404 });
  if (card.external_ops_url) return NextResponse.json({ url: card.external_ops_url }, { status: 200 });

  const res = await fetch(`${OPS_URL}/api/v1/projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPS_TOKEN}`,
      'X-Idempotency-Key': `dfy-crm-${cardId}`,
    },
    body: JSON.stringify({
      crm_deal_id: `dfy-crm-${cardId}`,
      client: {
        company_name: card.name || 'DFY Client',
        contact_name: card.name || 'DFY Client',
        contact_email: card.email || undefined,
        contact_phone: card.phone || undefined,
      },
      project: {
        name: `${card.name || 'DFY'} — Software Project`,
        type: 'web_app',
        start_status: 'for_follow_up',
      },
      financials: card.amount_centavos
        ? {
            package: 'DFY',
            contract_value_centavos: card.amount_centavos,
            signed_date: new Date().toISOString().slice(0, 10),
          }
        : undefined,
    }),
    signal: AbortSignal.timeout(12_000),
  });

  if (!res.ok && res.status !== 409) {
    return NextResponse.json({ error: `Ops API returned HTTP ${res.status}` }, { status: 502 });
  }

  const data = await res.json();
  const opsUrl = data.url || `${OPS_URL}/projects/${data.project_id}`;

  await sb
    .from('dfy_crm_cards')
    .update({ external_ops_url: opsUrl, updated_at: new Date().toISOString() })
    .eq('id', cardId);

  return NextResponse.json({ url: opsUrl }, { status: 201 });
}
