import { assemblePack } from '@/lib/council/pack';
import { settledDay } from '@/lib/council/session';
(async () => {
  const p: any = await assemblePack('BOSS' as any, settledDay());
  console.log('week', p.weekStart, '..', p.weekEnd, 'cutoff', p.settledCutoff);
  console.log('blendedRoas', p.thisWeek?.campaign?.roas, 'northStar', p.thisWeek?.northStar);
  console.log('economics', p.settings?.economics);
  console.log('malfunctions', p.malfunctions);
  console.log('sample confidence', p.thisWeek?.ads?.[0]?.confidence);
  console.log('\nbreakdowns.placement:');
  for (const r of p.thisWeek?.breakdowns?.placement ?? []) console.log(' ', r.key, '| roas', r.roas?.toFixed(2), '| spend₱', (r.spendCentavos / 100).toFixed(0), '| purchases', r.purchases);
  console.log('breakdowns.placement total spend₱', (p.thisWeek?.breakdowns?.placement ?? []).reduce((s: number, r: any) => s + r.spendCentavos, 0) / 100);
  console.log('\nbreakdowns.audience:');
  for (const r of p.thisWeek?.breakdowns?.audience ?? []) console.log(' ', r.key, '| roas', r.roas?.toFixed(2), '| spend₱', (r.spendCentavos / 100).toFixed(0), '| purchases', r.purchases);
  console.log('\nfunnel:', p.thisWeek?.funnel);
})();
