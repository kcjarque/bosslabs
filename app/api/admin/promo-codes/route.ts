/**
 * /api/admin/promo-codes — admin CRUD for promo codes.
 *
 * POST   create or update a code (upsert by code)
 * DELETE remove a code entirely
 *
 * Read happens server-side via the admin page directly hitting getPromoCodes.
 */

import { NextResponse } from 'next/server';
import { isAdminLoggedIn, isSameOrigin } from '@/lib/admin-auth';
import {
  deletePromoCode,
  findPromoCode,
  savePromoCode,
  type PromoCode,
  type PromoDiscountType,
} from '@/lib/db';

export const runtime = 'nodejs';

async function guard(req: Request): Promise<Response | null> {
  if (!(await isAdminLoggedIn())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

export async function POST(req: Request) {
  const blocked = await guard(req);
  if (blocked) return blocked;

  const body = (await req.json().catch(() => ({}))) as {
    code?: string;
    discountType?: PromoDiscountType;
    discountValue?: number;
    maxUses?: number | null;
    expiresAt?: string | null;
    active?: boolean;
    note?: string | null;
    /** Product scope — which checkout may redeem this code. 'any' = site-wide. */
    product?: string | null;
  };

  const code = (body.code ?? '').trim().toUpperCase();
  if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 });
  if (!/^[A-Z0-9_-]{2,40}$/.test(code)) {
    return NextResponse.json(
      { error: 'code must be 2–40 chars, A–Z / 0–9 / underscore / hyphen' },
      { status: 400 },
    );
  }
  if (!body.discountType || !['free', 'percent', 'fixed'].includes(body.discountType)) {
    return NextResponse.json({ error: 'discountType must be free, percent, or fixed' }, { status: 400 });
  }
  const discountValue = Number.isFinite(body.discountValue) ? Number(body.discountValue) : 0;
  if (body.discountType === 'percent' && (discountValue < 1 || discountValue > 100)) {
    return NextResponse.json({ error: 'percent discount must be 1–100' }, { status: 400 });
  }
  if (body.discountType === 'fixed' && discountValue < 1) {
    return NextResponse.json({ error: 'fixed discount must be ≥ 1 centavo' }, { status: 400 });
  }

  // Preserve usesCount + createdAt on edit; new codes start at 0.
  const existing = await findPromoCode(code);

  // Product scope. 'any' (explicit site-wide choice) → null. Omitted:
  // preserve the existing scope on edit (the old code rebuilt the row
  // without `product`, silently wiping the scope of any code an admin
  // edited); NEW codes default to 'main' (webinar only) so an admin can't
  // accidentally mint a whole-cart code again.
  const VALID_PRODUCTS = ['main', 'vault', 'build_session', 'retreat'];
  let product: string | null;
  if (body.product === undefined) {
    product = existing ? (existing.product ?? null) : 'main';
  } else if (body.product === 'any' || body.product === null) {
    product = null;
  } else if (VALID_PRODUCTS.includes(body.product)) {
    product = body.product;
  } else {
    return NextResponse.json(
      { error: `product must be one of ${VALID_PRODUCTS.join(', ')}, or 'any'` },
      { status: 400 },
    );
  }

  const next: PromoCode = {
    code,
    discountType: body.discountType,
    discountValue,
    maxUses: body.maxUses == null || body.maxUses === 0 ? null : Math.max(1, Number(body.maxUses)),
    usesCount: existing?.usesCount ?? 0,
    expiresAt: body.expiresAt || null,
    active: body.active ?? true,
    note: body.note ?? null,
    product,
    createdByCloser: existing?.createdByCloser ?? null,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
  const saved = await savePromoCode(next);
  return NextResponse.json({ ok: true, promo: saved });
}

export async function DELETE(req: Request) {
  const blocked = await guard(req);
  if (blocked) return blocked;

  const { searchParams } = new URL(req.url);
  const code = (searchParams.get('code') ?? '').trim();
  if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 });
  const ok = await deletePromoCode(code);
  return NextResponse.json({ ok });
}
