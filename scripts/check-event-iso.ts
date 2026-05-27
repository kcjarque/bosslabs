/**
 * Verify how event start times are actually stored vs what they
 * display as. The cron does Date.parse(event.starts_at_iso) so
 * an offset-less ISO would be interpreted as UTC, shifting the
 * effective fire times by 8 hours.
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

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data } = await sb.from('events').select('*');
  for (const ev of (data as Array<{ id: string; name: string; starts_at_iso: string; timezone: string }>) ?? []) {
    const ms = Date.parse(ev.starts_at_iso);
    const asUTC = new Date(ms).toISOString();
    const asManila = new Date(ms).toLocaleString('en-PH', {
      timeZone: 'Asia/Manila',
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    console.log(`Event: ${ev.name}`);
    console.log(`  starts_at_iso (raw):   ${ev.starts_at_iso}`);
    console.log(`  timezone field:        ${ev.timezone}`);
    console.log(`  parsed as UTC:         ${asUTC}`);
    console.log(`  displayed in Manila:   ${asManila}`);
    console.log(`  hasOffset (+ or Z):    ${/[+-]\d{2}:\d{2}$|Z$/.test(ev.starts_at_iso)}`);
    console.log('');
  }
}

main().catch(console.error);
