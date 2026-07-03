-- Headcount on a retreat reservation (how many people the reservation is for).
alter table retreat_reservations add column if not exists persons integer not null default 1;
