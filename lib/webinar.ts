/**
 * Server-side helper: returns the live webinar configuration.
 *
 *   Priority: Supabase `settings` row → process.env → hardcoded defaults
 *
 * Anything you edit in /admin/settings wins. Env vars are bootstrap defaults
 * (handy for first-ever deploys before the admin has touched anything).
 */

import { getSettings, getEvent, type Signup } from './db';
import { OFFER } from './config';

export type WebinarInfo = {
  name: string;
  date: string;
  time: string;
  timezone: string;
  startsAtIso: string;
  zoomRegisterUrl: string;
  zoomJoinUrl: string;
  replayUrl: string;
  messengerGroupUrl: string;
};

const HARD_DEFAULTS: WebinarInfo = {
  name: 'AI Coding 101 — The BOSSLABS AI Webinar',
  date: 'To Be Announced',
  time: '8:00 PM',
  timezone: 'PHT',
  startsAtIso: '',
  zoomRegisterUrl: '',
  zoomJoinUrl: '',
  replayUrl: '',
  messengerGroupUrl: '',
};

function pick(...vals: (string | undefined | null)[]): string {
  for (const v of vals) {
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return '';
}

/**
 * Build the template-variable map for a specific customer's email/SMS.
 *
 * The Zoom join URL resolves per-event: if the signup is tagged with an
 * event that has its own zoom_join_url, that wins; otherwise it falls
 * back to the global webinar (settings) link. Everything else comes from
 * the shared webinar info. Pass the already-loaded WebinarInfo so the
 * caller controls how many times getWebinarInfo() runs.
 */
export async function templateVarsForSignup(
  signup: Pick<Signup, 'firstName' | 'lastName' | 'email' | 'phone' | 'eventId'>,
  webinar: WebinarInfo,
): Promise<Record<string, string>> {
  let zoomJoinUrl = webinar.zoomJoinUrl;
  if (signup.eventId) {
    try {
      const event = await getEvent(signup.eventId);
      if (event?.zoomJoinUrl) zoomJoinUrl = event.zoomJoinUrl;
    } catch {
      // fall back to the global link on any lookup error
    }
  }
  return {
    firstName: signup.firstName,
    lastName: signup.lastName ?? '',
    email: signup.email,
    phone: signup.phone,
    webinarName: webinar.name,
    webinarDate: webinar.date,
    webinarTime: webinar.time,
    webinarTimezone: webinar.timezone,
    zoomJoinUrl,
    zoomRegisterUrl: webinar.zoomRegisterUrl,
    replayUrl: webinar.replayUrl,
    messengerGroupUrl: webinar.messengerGroupUrl,
    // Resume-payment link for cart-recovery emails/SMS.
    checkoutUrl:
      (process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
        'https://www.bosslabs.live') + '/checkout',
  };
}

/**
 * Resolve the live 1on1 MVP Session pricing.
 *
 * The offer is an "Action Taker Bonus": ₱1,997 (shown discounted from ₱3,997)
 * BEFORE/DURING the webinar, and the full ₱3,997 once it has wrapped. The flip
 * happens `start + 3h` so live action-takers still get the bonus rate.
 *
 * Server-authoritative on purpose: the checkout/OTO/order-bump charge routes
 * AND the display surfaces both resolve price here, so the amount shown always
 * equals the amount billed. Returns a plain serializable object so it can be
 * passed straight into client components as props.
 */
const OTO_FULL_AFTER_MS = 3 * 60 * 60 * 1000;

export type OtoOffer = {
  centavos: number;
  label: string;
  crossed: string | null;
  isFull: boolean;
};

export async function resolveOtoOffer(): Promise<OtoOffer> {
  const webinar = await getWebinarInfo();
  const start = Date.parse(webinar.startsAtIso || '');
  const isFull = !Number.isNaN(start) && Date.now() >= start + OTO_FULL_AFTER_MS;
  return isFull
    ? { centavos: OFFER.oto.fullPriceCentavos, label: OFFER.oto.fullLabel, crossed: null, isFull: true }
    : { centavos: OFFER.oto.priceCentavos, label: OFFER.oto.label, crossed: OFFER.oto.crossed, isFull: false };
}

export async function getWebinarInfo(): Promise<WebinarInfo> {
  let settings;
  try {
    settings = await getSettings();
  } catch {
    settings = null;
  }

  return {
    name: pick(settings?.webinarName, process.env.NEXT_PUBLIC_WEBINAR_NAME, HARD_DEFAULTS.name),
    date: pick(settings?.webinarDate, process.env.NEXT_PUBLIC_WEBINAR_DATE, HARD_DEFAULTS.date),
    time: pick(settings?.webinarTime, process.env.NEXT_PUBLIC_WEBINAR_TIME, HARD_DEFAULTS.time),
    timezone: pick(
      settings?.webinarTimezone,
      process.env.NEXT_PUBLIC_WEBINAR_TZ,
      HARD_DEFAULTS.timezone,
    ),
    startsAtIso: pick(
      settings?.webinarStartsAtIso,
      process.env.NEXT_PUBLIC_WEBINAR_STARTS_AT_ISO,
      HARD_DEFAULTS.startsAtIso,
    ),
    zoomRegisterUrl: pick(
      settings?.zoomRegisterUrl,
      process.env.NEXT_PUBLIC_ZOOM_REGISTER_URL,
      HARD_DEFAULTS.zoomRegisterUrl,
    ),
    zoomJoinUrl: pick(settings?.zoomJoinUrl, HARD_DEFAULTS.zoomJoinUrl),
    replayUrl: pick(settings?.replayUrl, HARD_DEFAULTS.replayUrl),
    messengerGroupUrl: pick(
      settings?.messengerGroupUrl,
      process.env.NEXT_PUBLIC_MESSENGER_GROUP_URL,
      HARD_DEFAULTS.messengerGroupUrl,
    ),
  };
}
