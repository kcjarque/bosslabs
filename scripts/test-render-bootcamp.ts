import { renderEmail } from '@/lib/email';

async function main() {
  const samples = [
    'pw_retreat',
    'pw_lastcall',
    'after_webinar',
    'post_webinar_unpaid',
    'facebook_group',
    'oto_confirmation',
    'pw_orderbump',
  ];
  const vars = {
    firstName: 'Juan',
    amount: 'PHP 3,997',
    replayUrl: 'https://www.bosslabs.live/replay',
    webinarDate: 'June 24',
    webinarTime: '8:00 PM',
  };
  for (const id of samples) {
    const r = await renderEmail(id, vars);
    if (!r) {
      console.log(id, '→ NOT FOUND');
      continue;
    }
    const html = r.html;
    const hasBootcampLink = html.includes('founders-bootcamp');
    const unsubstituted = html.match(/\{\{[^}]+\}\}/g) || [];
    const rawMd = /\[\[|\^\^|^# /m.test(html);
    console.log(id.padEnd(22), 'len:', String(html.length).padStart(5), '— subject:', r.subject);
    console.log(
      ' '.repeat(22),
      'bootcamp-link:',
      hasBootcampLink ? '✓' : '✗',
      ' unsub-vars:',
      unsubstituted.length === 0 ? '✓' : '⚠️ ' + unsubstituted.join(','),
      ' raw-md-leftovers:',
      rawMd ? '⚠️' : '✓',
    );
  }
}
void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
