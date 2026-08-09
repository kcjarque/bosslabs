import { assemblePack } from '@/lib/council/pack';
import { settledDay } from '@/lib/council/session';
(async () => {
  const p: any = await assemblePack('BOSS' as any, settledDay());
  console.log('week', p.weekStart, '..', p.weekEnd, 'cutoff', p.settledCutoff);
  console.log('blendedRoas', p.thisWeek?.campaign?.roas, 'northStar', p.thisWeek?.northStar);
  console.log('economics', p.settings?.economics);
})();
