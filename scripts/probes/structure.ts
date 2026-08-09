import { getCampaignStructures } from '@/lib/meta-ads';
(async () => { for (const c of await getCampaignStructures()) console.log(c.name, '|', c.budgetType, '|', (c as any).objective); })();
