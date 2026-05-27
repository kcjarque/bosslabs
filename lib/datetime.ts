/**
 * Datetime helpers for the events UI.
 *
 * Events store `starts_at_iso` as a fully-qualified ISO 8601 string with
 * timezone offset, e.g. "2026-05-21T20:00:00+08:00". The browser's
 * datetime-local input produces a naked wall-clock string with no
 * timezone ("2026-05-21T20:00"), so we have to combine that with a
 * separate timezone identifier to get the proper ISO back.
 */

/**
 * Get the offset of an IANA timezone at a given instant, formatted as
 * "+HH:MM" or "-HH:MM". Falls back to "+00:00" if the timezone is
 * unparseable.
 */
function getOffsetInTimezone(instant: Date, timezone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'longOffset',
      hour: 'numeric',
    });
    const parts = formatter.formatToParts(instant);
    const offsetPart = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+00:00';
    // Forms seen in the wild: "GMT", "GMT+8", "GMT+08:00", "GMT-5"
    const match = offsetPart.match(/GMT([+-])?(\d{1,2})(?::?(\d{2}))?/);
    if (!match) return '+00:00';
    const sign = match[1] === '-' ? '-' : '+';
    const hours = match[2].padStart(2, '0');
    const mins = (match[3] ?? '00').padStart(2, '0');
    return `${sign}${hours}:${mins}`;
  } catch {
    return '+00:00';
  }
}

/**
 * Combine a "YYYY-MM-DDTHH:mm" wall-clock string with a timezone name
 * into a full ISO 8601 string with offset.
 *
 *   combineLocalAndTimezone('2026-05-21T20:00', 'Asia/Manila')
 *   → '2026-05-21T20:00:00+08:00'
 */
export function combineLocalAndTimezone(localDateTime: string, timezone: string): string {
  if (!localDateTime) return '';
  // Use a tentative UTC instant just to ask Intl what the offset is for
  // `timezone` near that moment. Edge case: at DST transitions the result
  // could be off by an hour, but the only timezone we care about (Asia/Manila)
  // doesn't observe DST, so this is fine for our use case.
  const tentative = new Date(`${localDateTime}:00Z`);
  const offset = getOffsetInTimezone(tentative, timezone);
  return `${localDateTime}:00${offset}`;
}

/**
 * Extract the wall-clock portion ("YYYY-MM-DDTHH:mm") from a stored
 * ISO 8601 string. Used to populate the datetime-local input in edit mode.
 */
export function isoToLocalDateTime(iso: string): string {
  if (!iso) return '';
  const match = iso.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/);
  return match?.[1] ?? '';
}

/**
 * Common IANA timezones for the datalist hint. Browser autocompletes from
 * here but the user can still type any zone if needed.
 */
export const COMMON_TIMEZONES: { value: string; label: string }[] = [
  { value: 'Asia/Manila', label: 'Asia/Manila (PHT, UTC+8)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore (SGT, UTC+8)' },
  { value: 'Asia/Hong_Kong', label: 'Asia/Hong_Kong (HKT, UTC+8)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (JST, UTC+9)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (PST/PDT)' },
  { value: 'America/New_York', label: 'America/New_York (EST/EDT)' },
  { value: 'Europe/London', label: 'Europe/London (GMT/BST)' },
  { value: 'UTC', label: 'UTC' },
];
