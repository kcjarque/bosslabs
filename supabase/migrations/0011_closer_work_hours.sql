-- Closer working hours (Asia/Manila, 24h). The claim hold timer only counts
-- down within [start, end); off-hours are paused. Default 9am–8pm daily.
alter table settings add column if not exists closer_work_start_hour numeric not null default 9;
alter table settings add column if not exists closer_work_end_hour numeric not null default 20;
