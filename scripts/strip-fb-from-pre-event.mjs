// Strip the FB review CTA from emails that go BEFORE the recipient has
// experienced the event (webinar / retreat). Reviews should only land in
// post-event emails where the buyer has actually seen what we deliver.
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/** Matches the entire FB review block we appended (the leading `---` divider
 *  through "someone you'll never meet."). Trailing whitespace also trimmed. */
const FB_BLOCK = /\n+---\n+## 🙏 Help us reach more Filipino founders[\s\S]+?someone you'll never meet\.\s*$/;

const TARGETS = ['paid_confirmation', 'retreat_confirmation'];

let ok = 0, missed = 0;
for (const id of TARGETS) {
  const { data, error: r } = await sb.from('email_templates').select('body').eq('id', id).single();
  if (r) { console.error('read', id, r.message); continue; }
  const body = String(data.body || '');
  if (!FB_BLOCK.test(body)) {
    console.log('— skipped', id, '(no FB block matched)');
    missed++;
    continue;
  }
  const newBody = body.replace(FB_BLOCK, '');
  const { error } = await sb.from('email_templates').update({ body: newBody, html: '' }).eq('id', id);
  if (error) { console.error('✗', id, error.message); continue; }
  console.log('✓ stripped FB block from', id, '·', body.length, '→', newBody.length, 'chars');
  ok++;
}
console.log(`\nDone. ${ok}/${TARGETS.length} stripped, ${missed} skipped.`);
