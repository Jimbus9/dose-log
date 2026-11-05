-- Dose Log: glucose readings from LibreLinkUp
-- Run once in Supabase > SQL Editor (after setup.sql). Safe to run again.
--
-- Readings are written only by the libre-sync function (it uses the service
-- role, which bypasses these rules). Family members can read them; nobody
-- can write them from the app.

create table if not exists public.glucose (
  ts     timestamptz primary key,
  mgdl   integer not null check (mgdl between 10 and 600),
  trend  smallint check (trend between 0 and 5)
);

create table if not exists public.libre_status (
  id             integer primary key default 1 check (id = 1),
  last_ok        timestamptz,
  last_error     text,
  last_error_at  timestamptz
);
insert into public.libre_status (id) values (1) on conflict (id) do nothing;

-- Holds the LibreLinkUp login token between runs. No one but the sync
-- function can read it.
create table if not exists public.libre_session (
  id          integer primary key default 1 check (id = 1),
  base_url    text,
  token       text,
  account_id  text,
  expires_at  timestamptz
);

alter table public.glucose       enable row level security;
alter table public.libre_status  enable row level security;
alter table public.libre_session enable row level security;

revoke all on public.glucose, public.libre_status, public.libre_session from anon, authenticated;
grant select on public.glucose, public.libre_status to authenticated;

drop policy if exists "family reads glucose"     on public.glucose;
drop policy if exists "family reads libre status" on public.libre_status;
create policy "family reads glucose"      on public.glucose      for select to authenticated using (public.is_member());
create policy "family reads libre status" on public.libre_status for select to authenticated using (public.is_member());

do $$
begin
  begin
    alter publication supabase_realtime add table public.glucose;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.libre_status;
  exception when duplicate_object then null;
  end;
end $$;
