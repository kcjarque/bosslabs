import { renderEmail } from '@/lib/email';

async function main() {
  const ids = ['after_webinar', 'post_webinar_unpaid', 'facebook_group'];
  for (const id of ids) {
    const r = await renderEmail(id, {
      firstName: 'Juan',
      amount: 'PHP 3,997',
      replayUrl: 'https://www.bosslabs.live/replay',
    });
    if (!r) continue;
    console.log('===', id, '===');
    // Show all href= occurrences
    const hrefs = [...r.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    for (const h of hrefs) console.log('  href:', h);
    // Find any literal text mentioning 'bootcamp' or 'founders'
    const ctx = r.html.match(/.{30}(bootcamp|Bootcamp|Founder)[^<]{0,80}/g) || [];
    for (const c of ctx.slice(0, 5)) console.log('  text:', c);
  }
}
void main();
