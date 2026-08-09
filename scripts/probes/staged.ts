import { runStagedCouncil } from '@/lib/council/session';
(async () => console.log(await runStagedCouncil('BOSS' as any, ['manual staged test'], { model: 'claude-sonnet-5' })))();
