/**
 * Offers — the SINGLE SOURCE OF PRICE TRUTH (SPEC §1.5). Every template/page
 * reads price/seat/date/status from here instead of hardcoding, which kills the
 * "3 conflicting prices live" bug class. Read on every send/render, so a small
 * in-process cache keeps it cheap.
 */
import { getSupabase, isSupabaseConfigured } from './supabase';

export type OfferKey = 'retreat' | 'dfy' | 'vault' | 'oto_1on1';
export type OfferStatus = 'open' | 'waitlist' | 'closed';

export type Offer = {
  key: string;
  status: OfferStatus;
  nextInstanceDate: string | null;
  seatsTotal: number | null;
  seatsTaken: number | null;
  priceDisplay: string | null;
  priceCentavos: number | null;
  targetUrl: string | null;
};

type OfferRow = {
  key: string;
  status: string;
  next_instance_date: string | null;
  seats_total: number | null;
  seats_taken: number | null;
  price_display: string | null;
  price_centavos: number | null;
  target_url: string | null;
};

let cache: { at: number; offers: Record<string, Offer> } | null = null;
const TTL_MS = 60_000;

export async function getOffers(): Promise<Record<string, Offer>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.offers;
  if (!isSupabaseConfigured()) return {};
  const { data, error } = await getSupabase().from('offers').select('*');
  if (error) return cache?.offers ?? {};
  const offers: Record<string, Offer> = {};
  for (const r of (data ?? []) as OfferRow[]) {
    offers[r.key] = {
      key: r.key,
      status: (['open', 'waitlist', 'closed'].includes(r.status) ? r.status : 'open') as OfferStatus,
      nextInstanceDate: r.next_instance_date,
      seatsTotal: r.seats_total,
      seatsTaken: r.seats_taken,
      priceDisplay: r.price_display,
      priceCentavos: r.price_centavos,
      targetUrl: r.target_url,
    };
  }
  cache = { at: Date.now(), offers };
  return offers;
}

export async function getOffer(key: OfferKey | string): Promise<Offer | null> {
  return (await getOffers())[key] ?? null;
}

/** Seats remaining for a seated offer (retreat / DFY slots), or null if uncapped. */
export function seatsLeft(o: Offer): number | null {
  if (o.seatsTotal == null) return null;
  return Math.max(0, o.seatsTotal - (o.seatsTaken ?? 0));
}

/** Flat map of `offer.<key>.<field>` → value, for injecting into template vars
 *  so copy can write {{offer.retreat.price_display}} etc. */
export async function offerTemplateVars(): Promise<Record<string, string>> {
  const offers = await getOffers();
  const vars: Record<string, string> = {};
  for (const [key, o] of Object.entries(offers)) {
    if (o.priceDisplay) vars[`offer.${key}.price_display`] = o.priceDisplay;
    if (o.nextInstanceDate) vars[`offer.${key}.next_instance_date`] = o.nextInstanceDate;
    const left = seatsLeft(o);
    if (left != null) vars[`offer.${key}.seats_left`] = String(left);
    if (o.targetUrl) vars[`offer.${key}.url`] = o.targetUrl;
  }
  return vars;
}
