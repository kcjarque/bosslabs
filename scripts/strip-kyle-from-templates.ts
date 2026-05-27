/**
 * One-off: strip "Mikey & Kyle" / "Mikey &amp; Kyle" → "Mikey" from
 * every email template's html + body in the live database. The seed
 * migration uses `on conflict do nothing`, so editing the migration
 * file alone won't update rows that already exist in production.
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
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const sb = createClient(url, key);

  const { data: templates, error } = await sb
    .from('email_templates')
    .select('id, name, html, body');
  if (error) throw new Error(`fetch: ${error.message}`);

  let updated = 0;
  for (const t of templates ?? []) {
    const oldHtml = (t.html as string) ?? '';
    const oldBody = (t.body as string | null) ?? null;
    // Replace both the HTML-encoded ampersand version and the raw version.
    const newHtml = oldHtml
      .replace(/Mikey &amp; Kyle/g, 'Mikey')
      .replace(/Mikey & Kyle/g, 'Mikey');
    const newBody =
      oldBody === null
        ? null
        : oldBody
            .replace(/Mikey &amp; Kyle/g, 'Mikey')
            .replace(/Mikey & Kyle/g, 'Mikey');
    if (newHtml === oldHtml && newBody === oldBody) continue;

    const { error: upErr } = await sb
      .from('email_templates')
      .update({ html: newHtml, body: newBody, updated_at: new Date().toISOString() })
      .eq('id', t.id);
    if (upErr) {
      console.warn(`  ${t.id}: ${upErr.message}`);
      continue;
    }
    console.log(`  ${t.id} (${t.name}) — updated`);
    updated++;
  }
  console.log(`\nUpdated ${updated} template${updated === 1 ? '' : 's'}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
