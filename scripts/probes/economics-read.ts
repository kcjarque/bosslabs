import { getCouncilSettings } from '@/lib/council/db';
(async () => console.log(await getCouncilSettings('BOSS' as any)))();
