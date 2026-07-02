/**
 * Auto-advance the active webinar event.
 *
 * 30 minutes after the current active event starts, re-point the "backend"
 * (settings.active_event_id + the displayed webinar date/time/Zoom that drive
 * the homepage, countdown bar, default signup routing, and email variables) to
 * the NEXT upcoming session. Nothing is created or deleted — the events already
 * exist (created by the weekly rollover). The just-started event stays active,
 * so its own post-event replay/drip sequences keep firing (they anchor to that
 * event's start, not to active_event_id).
 *
 * Idempotent: once flipped, the new active event is in the future, so this
 * no-ops until that one has started + 30 min too.
 */
import { getSettings, saveSettings, getEvents, type EventModel } from './db';

const ADVANCE_AFTER_MS = 30 * 60_000; // 30 min after start
const TZ = 'Asia/Manila';

function displayDate(iso: string, tz: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    timeZone: tz || TZ,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}
function displayTime(iso: string, tz: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    timeZone: tz || TZ,
    hour: 'numeric',
    minute: '2-digit',
  });
}

export type AutoRolloverResult =
  | { status: 'skipped'; reason: string }
  | { status: 'needs_next_event'; fromName: string; fromStartsAtIso: string }
  | { status: 'advanced'; fromName: string; toName: string; toStartsAtIso: string };

export async function autoAdvanceActiveEvent(nowMs = Date.now()): Promise<AutoRolloverResult> {
  const settings = await getSettings();
  const activeId = settings.activeEventId;
  if (!activeId) return { status: 'skipped', reason: 'no active event configured' };

  const events = await getEvents();
  const active = events.find((e) => e.id === activeId);
  if (!active) return { status: 'skipped', reason: 'active event not found' };

  const startMs = Date.parse(active.startsAtIso);
  if (Number.isNaN(startMs)) return { status: 'skipped', reason: 'active event has no valid start' };

  // Not yet 30 min past the active event's start → nothing to do.
  if (nowMs < startMs + ADVANCE_AFTER_MS) {
    return { status: 'skipped', reason: 'active event not yet started + 30min' };
  }

  // Find the soonest active event whose start is still in the future.
  const upcoming = events
    .filter((e) => e.active && e.id !== activeId)
    .map((e) => ({ e, t: Date.parse(e.startsAtIso) }))
    .filter((x) => !Number.isNaN(x.t) && x.t > nowMs)
    .sort((a, b) => a.t - b.t);

  if (upcoming.length === 0) {
    return {
      status: 'needs_next_event',
      fromName: active.name,
      fromStartsAtIso: active.startsAtIso,
    };
  }

  const next: EventModel = upcoming[0].e;

  await saveSettings({
    activeEventId: next.id,
    webinarDate: displayDate(next.startsAtIso, next.timezone),
    webinarTime: displayTime(next.startsAtIso, next.timezone),
    webinarTimezone: 'PHT',
    webinarStartsAtIso: next.startsAtIso,
    // Per-event Zoom if set, otherwise keep the current global link.
    zoomJoinUrl: next.zoomJoinUrl || settings.zoomJoinUrl,
  });

  return {
    status: 'advanced',
    fromName: active.name,
    toName: next.name,
    toStartsAtIso: next.startsAtIso,
  };
}
