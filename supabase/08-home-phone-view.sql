-- Dose Log: switch for whether the dose-logging phone can look back at records.
-- Run once in Supabase > SQL Editor. Safe to run again.
alter table public.settings add column if not exists dad_sees_records boolean not null default true;
