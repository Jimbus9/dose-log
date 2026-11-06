-- Dose Log: health journal (write-ups after appointments)
-- Run once in Supabase > SQL Editor (after 02-appointments.sql). Safe to run again.

create table if not exists public.journal (
  id              uuid primary key default gen_random_uuid(),
  appointment_id  uuid references public.appointments (id) on delete set null,
  happened_on     date not null,
  title           text check (char_length(title) <= 120),
  summary         text not null check (char_length(summary) between 1 and 4000),
  changes         text check (char_length(changes) <= 4000),
  next_steps      text check (char_length(next_steps) <= 4000),
  written_by      text default lower(auth.jwt() ->> 'email'),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists journal_happened_idx on public.journal (happened_on desc);
create index if not exists journal_appt_idx on public.journal (appointment_id);

alter table public.journal enable row level security;
revoke all on public.journal from anon;
grant select, insert, update, delete on public.journal to authenticated;

drop policy if exists "family reads journal"   on public.journal;
drop policy if exists "family adds journal"    on public.journal;
drop policy if exists "family edits journal"   on public.journal;
drop policy if exists "family removes journal" on public.journal;
create policy "family reads journal"   on public.journal for select to authenticated using (public.is_member());
create policy "family adds journal"    on public.journal for insert to authenticated with check (public.is_member());
create policy "family edits journal"   on public.journal for update to authenticated using (public.is_member()) with check (public.is_member());
create policy "family removes journal" on public.journal for delete to authenticated using (public.is_member());

do $$
begin
  alter publication supabase_realtime add table public.journal;
exception when duplicate_object then null;
end $$;
