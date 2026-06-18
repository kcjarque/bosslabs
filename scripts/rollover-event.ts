/**
 * Weekly webinar rollover — clone the CURRENTLY-ACTIVE event's funnel infra into
 * a new event, then flip the site/emails to it. Clones from live state (not a
 * hardcoded template) so it always carries the latest sequence/step config.
 *
 * Safety: only INSERTS new rows + updates `settings` at the very end. NEVER
 * touches the previous (in-progress) event, its lists, or its sequences — so
 * that event's attendees, tonight's reminders, and its after-webinar drip keep
 * firing. Two events active at once is fine; `active_event_id` routes new signups.
 *
 * Run: npx tsx scripts/rollover-event.ts <YYYY-MM-DDTHH:MM> "<Display Date>"
 *   e.g. npx tsx scripts/rollover-event.ts 2026-06-24T19:00 "Wednesday June 24"
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

for (const line of readFileSync(resolve('.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}

import {
  getSettings, saveSettings, getEvents, getLists, getActiveSequences, getSequenceSteps,
  addEvent, addList, addSequence, addSequenceStep,
} from '@/lib/db';
import { combineLocalAndTimezone } from '@/lib/datetime';

const localDateTime = process.argv[2]; // e.g. 2026-06-24T19:00
const displayDate = process.argv[3];   // e.g. "Wednesday June 24"
if (!localDateTime || !displayDate) {
  console.error('Usage: rollover-event.ts <YYYY-MM-DDTHH:MM> "<Display Date>"');
  process.exit(1);
}
// Suffix for names = display date without the weekday prefix → "June 24".
const newSuffix = displayDate.replace(/^[A-Za-z]+\s+/, '').trim();

async function main() {
  const settings = await getSettings();
  const prevEventId = settings.activeEventId;          // ← NEVER mutate this event
  const zoom = settings.zoomJoinUrl || '';
  const startsAtIso = combineLocalAndTimezone(localDateTime, 'Asia/Manila');

  const events = await getEvents();
  const prev = events.find((e) => e.id === prevEventId);
  if (!prev) throw new Error('No active event found in settings.activeEventId');
  // Derive the previous suffix from the prev event name ("… — June 18" → "June 18").
  const prevSuffix = prev.name.split(/[—-]/).pop()!.trim();
  console.log(`PREV (untouched): "${prev.name}" [${prevEventId}] suffix="${prevSuffix}"`);

  // Guard: don't double-create.
  if (events.some((e) => e.name.includes(newSuffix))) {
    throw new Error(`An event already contains "${newSuffix}" — aborting to avoid duplicates.`);
  }

  // 1) Event (same recurring Zoom)
  const event = await addEvent({
    name: `AI Vibe Coding 101 — ${newSuffix}`,
    startsAtIso, timezone: 'Asia/Manila', active: true, zoomJoinUrl: zoom,
  });
  console.log(`✓ event ${event.id} · ${event.name} · ${event.startsAtIso}`);

  // 2) Lists — clone the prev event's lists' filters, re-dated
  const prevLists = (await getLists()).filter((l) => l.eventId === prevEventId);
  const prevPaid = prevLists.find((l) => l.filterTypes.includes('all_paid'));
  const prevAband = prevLists.find((l) => l.filterTypes.includes('abandoned'));
  if (!prevPaid || !prevAband) throw new Error('Prev event missing Paid/Abandoned list');
  const paidList = await addList({
    name: `AI Vibe Coding 101 - ${newSuffix} — Paid`,
    description: `Paid registrants for the ${displayDate} webinar.`,
    filterTypes: prevPaid.filterTypes, eventId: event.id,
  });
  const abandList = await addList({
    name: `Abandoned Checkout - ${newSuffix}`,
    description: `Abandoned checkouts for the ${displayDate} webinar.`,
    filterTypes: prevAband.filterTypes, eventId: event.id,
  });
  console.log(`✓ lists: Paid ${paidList.id} · Abandoned ${abandList.id}`);

  // 3) Clone all active sequences of the prev event (steps included)
  const sources = (await getActiveSequences()).filter((s) => s.eventId === prevEventId);
  for (const src of sources) {
    const newListId = src.listId === prevPaid.id ? paidList.id
      : src.listId === prevAband.id ? abandList.id
      : paidList.id; // default to Paid if a sequence used some other list
    const newName = src.name.split(prevSuffix).join(newSuffix);
    const newSeq = await addSequence({
      listId: newListId, eventId: event.id, name: newName,
      description: src.description ?? null, active: true,
    });
    const steps = await getSequenceSteps(src.id); // ordered by position
    for (const st of steps) {
      await addSequenceStep({
        sequenceId: newSeq.id, position: st.position,
        emailTemplateId: st.emailTemplateId, smsTemplateId: st.smsTemplateId,
        scheduleType: st.scheduleType, hoursOffset: st.hoursOffset, active: st.active,
      });
    }
    console.log(`✓ cloned "${src.name}" → "${newName}" (${steps.length} steps, list=${newListId === paidList.id ? 'Paid' : 'Abandoned'})`);
  }

  // 4) FLIP settings LAST — this is what re-points the site + new signups
  await saveSettings({
    activeEventId: event.id,
    webinarName: 'AI Vibe Coding 101',
    webinarDate: displayDate,
    webinarTime: '7:00 PM',
    webinarTimezone: 'PHT',
    webinarStartsAtIso: startsAtIso,
    zoomJoinUrl: zoom,
  });
  console.log(`✓ settings flipped → active_event_id=${event.id}, webinar_date="${displayDate}"`);
  console.log(`\nPREV event ${prevEventId} left active + untouched (its reminders/drip keep firing).`);
}

main().catch((e) => { console.error('ROLLOVER FAILED:', e); process.exit(1); });
