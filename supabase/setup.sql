-- Dose Log: database setup
-- Paste this whole file into Supabase > SQL Editor > New query, then click Run.
-- Safe to run more than once.
--
-- Access model: nobody sees anything unless their email is on the family list
-- (public.members). Signing in alone grants nothing.

-- ---------- Tables ----------

create table if not exists public.members (
  email      text primary key check (email = lower(email)),
  name       text not null default '',
  role       text not null default 'family' check (role in ('dad', 'family')),
  added_at   timestamptz not null default now()
);

create table if not exists public.entries (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('long', 'meal', 'snack')),
  at          timestamptz not null default now(),
  units       numeric check (units >= 0 and units <= 100),
  food        text check (char_length(food) <= 300),
  carbs       integer check (carbs between 0 and 400),
  photo_path  text,
  logged_by   text default lower(auth.jwt() ->> 'email'),
  created_at  timestamptz not null default now(),
  -- a snack never carries a dose; insulin entries always do
  constraint units_match_kind check (
    (kind = 'snack' and units is null) or (kind <> 'snack' and units is not null)
  )
);

create index if not exists entries_at_idx on public.entries (at desc);

create table if not exists public.settings (
  id          integer primary key default 1 check (id = 1),
  name        text not null default 'Dad',
  long_units  numeric not null default 20 check (long_units between 0 and 100),
  meal_units  numeric not null default 6  check (meal_units between 0 and 100),
  long_by     time not null default '10:00'
);
insert into public.settings (id) values (1) on conflict (id) do nothing;

-- ---------- Who is family ----------

create or replace function public.is_member()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.members
    where email = lower(auth.jwt() ->> 'email')
  );
$$;
revoke all on function public.is_member() from public, anon;
grant execute on function public.is_member() to authenticated;

-- ---------- Lock everything, then open only to family ----------

alter table public.members  enable row level security;
alter table public.entries  enable row level security;
alter table public.settings enable row level security;

revoke all on public.members, public.entries, public.settings from anon;
grant select, insert, update, delete on public.entries  to authenticated;
grant select, insert, update, delete on public.members  to authenticated;
grant select, update                 on public.settings to authenticated;

drop policy if exists "family reads entries"  on public.entries;
drop policy if exists "family writes entries" on public.entries;
drop policy if exists "family edits entries"  on public.entries;
drop policy if exists "family removes entries" on public.entries;
create policy "family reads entries"   on public.entries for select to authenticated using (public.is_member());
create policy "family writes entries"  on public.entries for insert to authenticated with check (public.is_member());
create policy "family edits entries"   on public.entries for update to authenticated using (public.is_member()) with check (public.is_member());
create policy "family removes entries" on public.entries for delete to authenticated using (public.is_member());

drop policy if exists "family reads settings" on public.settings;
drop policy if exists "family edits settings" on public.settings;
create policy "family reads settings" on public.settings for select to authenticated using (public.is_member());
create policy "family edits settings" on public.settings for update to authenticated using (public.is_member()) with check (public.is_member());

-- Anyone signed in can see whether THEY are on the list (so the app can say
-- "ask to be added"); only family can see or change the whole list.
drop policy if exists "see own membership"     on public.members;
drop policy if exists "family reads members"   on public.members;
drop policy if exists "family adds members"    on public.members;
drop policy if exists "family edits members"   on public.members;
drop policy if exists "family removes members" on public.members;
create policy "see own membership"     on public.members for select to authenticated using (email = lower(auth.jwt() ->> 'email'));
create policy "family reads members"   on public.members for select to authenticated using (public.is_member());
create policy "family adds members"    on public.members for insert to authenticated with check (public.is_member());
create policy "family edits members"   on public.members for update to authenticated using (public.is_member()) with check (public.is_member());
create policy "family removes members" on public.members for delete to authenticated
  using (public.is_member() and email <> lower(auth.jwt() ->> 'email'));  -- can't remove yourself

-- ---------- Food photos (private bucket) ----------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false;

drop policy if exists "family reads photos"   on storage.objects;
drop policy if exists "family adds photos"    on storage.objects;
drop policy if exists "family removes photos" on storage.objects;
create policy "family reads photos"   on storage.objects for select to authenticated using (bucket_id = 'photos' and public.is_member());
create policy "family adds photos"    on storage.objects for insert to authenticated with check (bucket_id = 'photos' and public.is_member());
create policy "family removes photos" on storage.objects for delete to authenticated using (bucket_id = 'photos' and public.is_member());

-- ---------- Live updates ----------

do $$
begin
  begin
    alter publication supabase_realtime add table public.entries;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.settings;
  exception when duplicate_object then null;
  end;
end $$;
