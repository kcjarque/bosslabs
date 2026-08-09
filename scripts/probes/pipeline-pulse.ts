import { runCouncilPipeline } from '@/lib/council/pipeline';
(async () => {
  const r = await runCouncilPipeline('BOSS' as any);
  console.log(r.brief);
  console.log('\ngraded', r.graded, '| triggers', r.triggers, '| syncError', r.syncError);
})();
