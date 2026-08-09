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
  console.log('\nthisWeek.pacing:');
  for (const r of p.thisWeek?.pacing ?? []) {
    console.log(' ', r.scope, r.name, '|', r.budgetType, '| budget₱', r.dailyBudgetCentavos != null ? (r.dailyBudgetCentavos / 100).toFixed(0) : 'null',
      '| avgDailySpend₱', (r.avgDailySpendCentavos / 100).toFixed(0), '| util', r.utilizationPct != null ? `${(r.utilizationPct * 100).toFixed(0)}%` : 'null',
      '| underDelivering', r.underDelivering, '| budgetCapped', r.budgetCapped);
  }
  console.log('\ncontext.dayOfWeek:');
  for (const r of p.context?.dayOfWeek ?? []) {
    console.log(' ', r.weekday, '| cpp₱', r.cppCentavos != null ? (r.cppCentavos / 100).toFixed(0) : 'null',
      '| roas', r.roas?.toFixed(2) ?? 'null', '| spendShare', r.spendSharePct != null ? `${(r.spendSharePct * 100).toFixed(1)}%` : 'null');
  }
})();
