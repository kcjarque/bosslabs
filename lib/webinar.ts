/**
 * Server-side helper: returns the live webinar configuration.
 *
 *   Priority: Supabase `settings` row → process.env → hardcoded defaults
 *
 * Anything you edit in /admin/settings wins. Env vars are bootstrap defaults
 * (handy for first-ever deploys before the admin has touched anything).
 */

import { getSettings, getEvent, type Signup } from './db';

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
  signup: Pick<
    Signup,
    'firstName' | 'lastName' | 'email' | 'phone' | 'eventId' | 'amountCentavos' | 'metadata'
  >,
  webinar: WebinarInfo,
): Promise<Record<string, string>> {
  let zoomJoinUrl = webinar.zoomJoinUrl;
  // Amount actually paid (metadata.paidAmount is PHP from the Xendit webhook);
  // fall back to the cart total. Formatted as "PHP 999" (NOT "₱999") on
  // purpose: the ₱ sign isn't in GSM-7, so it would force confirmation SMS into
  // Unicode (~3x the segments). Empty string when unknown so templates that
  // reference {{amount}} degrade gracefully.
  const paidPhp = (signup.metadata as { paidAmount?: number } | undefined)?.paidAmount;
  const amountCentavos =
    paidPhp != null ? Math.round(paidPhp * 100) : signup.amountCentavos ?? null;
  const amount =
    amountCentavos != null ? `PHP ${(amountCentavos / 100).toLocaleString('en-PH')}` : '';

  // Event-aware date/time/zoom — the signup owns which webinar they picked
  // (session picker on /checkout). Templates continue to reference
  // {{webinarDate}}/{{webinarTime}}/{{zoomJoinUrl}}; we just resolve them
  // from the signup's event when available. Falls back to global settings
  // when the signup has no event or the lookup fails.
  let webinarDate = webinar.date;
  let webinarTime = webinar.time;
  let webinarTimezone = webinar.timezone;
  if (signup.eventId) {
    try {
      const event = await getEvent(signup.eventId);
      if (event?.zoomJoinUrl) zoomJoinUrl = event.zoomJoinUrl;
      if (event?.startsAtIso) {
        const d = new Date(event.startsAtIso);
        const tzIana = event.timezone || 'Asia/Manila';
        webinarDate = d.toLocaleString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          timeZone: tzIana,
        });
        webinarTime = d.toLocaleString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          timeZone: tzIana,
        });
        webinarTimezone = tzIana === 'Asia/Manila' ? 'PHT' : webinar.timezone;
      }
    } catch {
      // fall back to the global settings on any lookup error
    }
  }
  return {
    firstName: signup.firstName,
    lastName: signup.lastName ?? '',
    email: signup.email,
    phone: signup.phone,
    amount,
    webinarName: webinar.name,
    webinarDate,
    webinarTime,
    webinarTimezone,
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
