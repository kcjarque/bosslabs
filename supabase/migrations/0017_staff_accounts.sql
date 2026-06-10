-- 0017_staff_accounts.sql
-- Staff accounts: scoped admin-panel logins (NOT the shared admin password).
-- Each staff member logs in at /admin/login with a username + password and
-- sees only the nav sections listed in `perms` (an allowlist of /admin hrefs).
-- The shared ADMIN_PASSWORD login remains full-access.
create table if not exists staff_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  username text not null unique,
  password_hash text,
  perms text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
