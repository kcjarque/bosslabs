/**
 * One-off: fix events whose starts_at_iso was stored with +00:00
 * because their timezone field was an abbreviation (e.g. "PHT") that
 * Intl.DateTimeFormat doesn't recognize. The fix:
 *
 *   1. Read every event row.
 *   2. If the ISO ends in +00:00 / Z but timezone resolves to a non-UTC
 *      zone, rewrite the ISO with the correct offset for that zone.
 *   3. Normalize the timezone field to its IANA name.
 *
 * Conservatively dry-run by default — pass --apply to write.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
try {
  const envFile = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of envFile.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
} catch {}

import { createClient } from '@supabase/supabase-js';
import { combineLocalAndTimezone, isoToLocalDateTime, resolveTimezone } from '@/lib/datetime';

const APPLY = process.argv.includes('--apply');

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data } = await sb.from('events').select('*');
  const rows = (data as Array<{ id: string; name: string; starts_at_iso: string; timezone: string }>) ?? [];

  for (const ev of rows) {
    const tzCanonical = resolveTimezone(ev.timezone);
    const hasOffset = /([+-]\d{2}:?\d{2}|Z)$/.test(ev.starts_at_iso);
    const isUtcOffset = /([+-]00:?00|Z)$/.test(ev.starts_at_iso);

    console.log(`\nEvent: ${ev.name}`);
    console.log(`  stored iso:     ${ev.starts_at_iso}`);
    console.log(`  stored tz:      ${ev.timezone}   → canonical: ${tzCanonical}`);

    // If the timezone resolves to UTC and the iso is +00:00, nothing to do.
    if (tzCanonical === 'UTC' || tzCanonical === 'Etc/GMT') {
      console.log('  → already UTC, no change');
      continue;
    }
    if (!hasOffset) {
      console.log('  → ISO has no offset at all; can\'t safely rewrite, skipping');
      continue;
    }
    if (!isUtcOffset) {
      console.log('  → ISO already has a non-UTC offset, skipping');
      continue;
    }

    // The wall-clock part of the ISO was meant to be in the local timezone.
    // Re-combine to get the right offset.
    const wallClock = isoToLocalDateTime(ev.starts_at_iso);
    const fixedIso = combineLocalAndTimezone(wallClock, tzCanonical);
    console.log(`  fixed iso:      ${fixedIso}`);
    console.log(`  fixed tz:       ${tzCanonical}`);

    if (!APPLY) {
      console.log('  (dry-run — pass --apply to write)');
      continue;
    }

    const { error } = await sb
      .from('events')
      .update({ starts_at_iso: fixedIso, timezone: tzCanonical })
      .eq('id', ev.id);
    if (error) console.log(`  ❌ update failed: ${error.message}`);
    else console.log('  ✅ updated');
  }
}

main().catch(console.error);
