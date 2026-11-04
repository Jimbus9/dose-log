-- Dose Log: appointments calendar
-- Run once in Supabase > SQL Editor (after setup.sql). Safe to run again.

create table if not exists public.appointments (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 120),
  starts_at   timestamptz not null,
  place       text check (char_length(place) <= 200),
  notes       text check (char_length(notes) <= 1000),
  created_by  text default lower(auth.jwt() ->> 'email'),
  created_at  timestamptz not null default now()
);
create index if not exists appointments_starts_idx on public.appointments (starts_at);

alter table public.appointments enable row level security;
revoke all on public.appointments from anon;
grant select, insert, update, delete on public.appointments to authenticated;

drop policy if exists "family reads appointments"   on public.appointments;
drop policy if exists "family adds appointments"    on public.appointments;
drop policy if exists "family edits appointments"   on public.appointments;
drop policy if exists "family removes appointments" on public.appointments;
create policy "family reads appointments"   on public.appointments for select to authenticated using (public.is_member());
create policy "family adds appointments"    on public.appointments for insert to authenticated with check (public.is_member());
create policy "family edits appointments"   on public.appointments for update to authenticated using (public.is_member()) with check (public.is_member());
create policy "family removes appointments" on public.appointments for delete to authenticated using (public.is_member());

do $$
begin
  alter publication supabase_realtime add table public.appointments;
exception when duplicate_object then null;
end $$;
