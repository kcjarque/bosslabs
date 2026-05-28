/**
 * One-off: switch the live webinar to "AI Vibe Coding 101" on June 4, 2026
 * 7:00 PM (Asia/Manila), create the matching registration List, and point
 * the homepage + signup-tagging at the new event.
 *
 * Run: npx tsx scripts/setup-june4-event.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env.local into process.env before any lib/db call (helpers read
// env lazily inside getSupabase(), so this runs before they're invoked).
for (const line of readFileSync(resolve('.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) {
    process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

import { addEvent, addList, saveSettings } from '@/lib/db';
import { combineLocalAndTimezone } from '@/lib/datetime';

async function main() {
  const startsAtIso = combineLocalAndTimezone('2026-06-04T19:00', 'Asia/Manila');
  console.log('startsAtIso:', startsAtIso);

  const event = await addEvent({
    name: 'AI Vibe Coding 101 - June 4',
    startsAtIso,
    timezone: 'Asia/Manila',
    active: true,
  });
  console.log('✓ event:', event.id, '·', event.name, '·', event.startsAtIso);

  const list = await addList({
    name: 'AI Vibe Coding 101 - June 4',
    description: 'Registrants for the June 4, 2026 AI Vibe Coding 101 webinar.',
    filterTypes: ['all_registered'],
    eventId: event.id,
  });
  console.log('✓ list:', list.id, '·', list.name, '· eventId=', list.eventId);

  const settings = await saveSettings({
    activeEventId: event.id,
    webinarName: 'AI Vibe Coding 101',
    webinarDate: 'Thursday June 4',
    webinarTime: '7:00 PM',
    webinarTimezone: 'PHT',
    webinarStartsAtIso: startsAtIso,
  });
  console.log(
    '✓ settings: activeEventId=',
    settings.activeEventId,
    '· date=',
    settings.webinarDate,
    settings.webinarTime,
    settings.webinarTimezone,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('✗ failed:', e);
    process.exit(1);
  });
