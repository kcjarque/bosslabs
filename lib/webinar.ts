/**
 * Server-side helper: returns the live webinar configuration.
 *
 *   Priority: Supabase `settings` row → process.env → hardcoded defaults
 *
 * Anything you edit in /admin/settings wins. Env vars are bootstrap defaults
 * (handy for first-ever deploys before the admin has touched anything).
 */

import { getSettings } from './db';

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
