import { getWeekBreakdowns } from '@/lib/council/breakdowns';
import { deriveWeekBounds } from '@/lib/council/pack';
import { settledDay } from '@/lib/council/session';
(async () => {
  const { weekStart, weekEnd } = deriveWeekBounds(settledDay());
  console.log('week', weekStart, '..', weekEnd);
  const { placement, audience, funnel } = await getWeekBreakdowns(weekStart, weekEnd);
  console.log('\nplacement:');
  for (const r of placement) console.log(' ', r.key, '| roas', r.roas?.toFixed(2), '| spend₱', (r.spendCentavos / 100).toFixed(0), '| purchases', r.purchases);
  console.log('\naudience:');
  for (const r of audience) console.log(' ', r.key, '| roas', r.roas?.toFixed(2), '| spend₱', (r.spendCentavos / 100).toFixed(0), '| purchases', r.purchases);
  console.log('\nfunnel:', funnel);
})();
