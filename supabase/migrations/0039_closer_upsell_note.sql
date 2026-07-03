-- Inline note per upsell lead (same idea as the abandoned-cart board's remark).
alter table closer_upsell_leads add column if not exists note text;
