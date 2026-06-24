import { renderEmail } from '@/lib/email';

async function main() {
  const ids = ['after_webinar', 'pw_orderbump', 'pw_orderbump2', 'pw_community', 'pw_retreat', 'pw_lastcall', 'paid_confirmation', 'oto_confirmation', 'vault_confirmation', 'retreat_confirmation'];
  const vars = {
    firstName: 'Juan',
    amount: 'PHP 3,997',
    replayUrl: 'https://www.bosslabs.live/replay',
    webinarDate: 'July 2',
    webinarTime: '7:00 PM',
    webinarTimezone: 'PHT',
    zoomJoinUrl: 'https://us02web.zoom.us/j/86011649255',
  };
  for (const id of ids) {
    const r = await renderEmail(id, vars);
    if (!r) { console.log(id, '→ NOT FOUND'); continue; }
    const hasFb = r.html.includes('facebook.com/bosslabsai');
    const hasReview = /review/i.test(r.html);
    const hasUnsubsts = /\{\{[^}]+\}\}/.test(r.html);
    console.log(id.padEnd(22), 'FB-CTA:', hasFb ? '✓' : '✗', ' review-word:', hasReview ? '✓' : '✗', ' unsub-vars:', hasUnsubsts ? '⚠️' : '✓', ' subject:', r.subject);
  }
}
void main();
