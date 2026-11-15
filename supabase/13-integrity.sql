-- Dose Log: make "who did this" trustworthy, and enforce what the Home-screen phone can do.
-- Run once in Supabase > SQL Editor (after 09-admin-role.sql). Safe to run again.
--
-- 1. "Logged by", "Written by" and "Created by" are always set by the database from
--    the signed-in email. Whatever the app sends is ignored, and they can't be changed later.
-- 2. A new dose can't arrive already marked as checked by an admin, or as already alerted.
-- 3. The Home-screen phone (role 'dad', shown as "Logs doses") can:
--      - log doses, meals and snacks, and change or remove only the ones it logged
--      - write journal entries, and edit or delete only the ones it wrote
--      - read appointments, but not add, change or remove them
--    Everyone else on the family list keeps the access they had.
-- The reminder and sync functions use the service role, so none of this affects them.

create or replace function public.is_logger()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.members
    where email = lower(auth.jwt() ->> 'email') and role = 'dad'
  );
$$;
revoke all on function public.is_logger() from public, anon;
grant execute on function public.is_logger() to authenticated;

-- ---------- 1 and 2: stamp the author, block pre-checked doses ----------

-- Only applies to requests from the app (signed-in people). Admin checks go through
-- ack_entry(), which runs as the database owner, so it isn't affected.
create or replace function public.stamp_author()
returns trigger
language plpgsql
as $$
declare
  col text := tg_argv[0];
  me  text := lower(auth.jwt() ->> 'email');
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new := jsonb_populate_record(new, jsonb_build_object(col, me));
  else
    new := jsonb_populate_record(new, jsonb_build_object(col, to_jsonb(old) ->> col));
  end if;
  return new;
end;
$$;

create or replace function public.entries_clear_checks()
returns trigger
language plpgsql
as $$
begin
  -- Written this way so it also works before 11-dose-checks.sql has added these columns.
  if current_user in ('authenticated', 'anon') then
    new := jsonb_populate_record(new, '{"acked_by": null, "acked_at": null, "alerted_at": null}'::jsonb);
  end if;
  return new;
end;
$$;

drop trigger if exists entries_stamp_author on public.entries;
create trigger entries_stamp_author before insert or update on public.entries
  for each row execute function public.stamp_author('logged_by');

drop trigger if exists entries_clear_checks on public.entries;
create trigger entries_clear_checks before insert on public.entries
  for each row execute function public.entries_clear_checks();

drop trigger if exists journal_stamp_author on public.journal;
create trigger journal_stamp_author before insert or update on public.journal
  for each row execute function public.stamp_author('written_by');

drop trigger if exists appointments_stamp_author on public.appointments;
create trigger appointments_stamp_author before insert or update on public.appointments
  for each row execute function public.stamp_author('created_by');

-- ---------- 3: limits for the Home-screen phone ----------
-- "as restrictive" means these are checked on top of the family-list rules, not instead of them.

drop policy if exists "logger edits own entries"   on public.entries;
drop policy if exists "logger removes own entries" on public.entries;
create policy "logger edits own entries" on public.entries as restrictive for update to authenticated
  using (not public.is_logger() or logged_by = lower(auth.jwt() ->> 'email'))
  with check (not public.is_logger() or logged_by = lower(auth.jwt() ->> 'email'));
create policy "logger removes own entries" on public.entries as restrictive for delete to authenticated
  using (not public.is_logger() or logged_by = lower(auth.jwt() ->> 'email'));

drop policy if exists "logger edits own journal"   on public.journal;
drop policy if exists "logger removes own journal" on public.journal;
create policy "logger edits own journal" on public.journal as restrictive for update to authenticated
  using (not public.is_logger() or written_by = lower(auth.jwt() ->> 'email'))
  with check (not public.is_logger() or written_by = lower(auth.jwt() ->> 'email'));
create policy "logger removes own journal" on public.journal as restrictive for delete to authenticated
  using (not public.is_logger() or written_by = lower(auth.jwt() ->> 'email'));

drop policy if exists "logger can't add appointments"    on public.appointments;
drop policy if exists "logger can't edit appointments"   on public.appointments;
drop policy if exists "logger can't remove appointments" on public.appointments;
create policy "logger can't add appointments" on public.appointments as restrictive for insert to authenticated
  with check (not public.is_logger());
create policy "logger can't edit appointments" on public.appointments as restrictive for update to authenticated
  using (not public.is_logger()) with check (not public.is_logger());
create policy "logger can't remove appointments" on public.appointments as restrictive for delete to authenticated
  using (not public.is_logger());
