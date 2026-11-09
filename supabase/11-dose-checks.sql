-- Dose Log: admins confirm doses, and get an alert when a new dose is logged.
-- Run once in Supabase > SQL Editor (after 09-admin-role.sql). Safe to run again.

alter table public.entries
  add column if not exists acked_by   text,
  add column if not exists acked_at   timestamptz,
  add column if not exists alerted_at timestamptz;   -- set by the reminders function once admins were alerted

-- Only admins can mark a dose as checked, and only through ack_entry() below.
-- Anyone else changing these columns directly is refused, whatever the app does.
create or replace function public.entries_guard_checks()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') and (
       new.acked_by   is distinct from old.acked_by or
       new.acked_at   is distinct from old.acked_at or
       new.alerted_at is distinct from old.alerted_at) then
    raise exception 'Only an admin can mark a dose as checked.';
  end if;
  return new;
end;
$$;

drop trigger if exists entries_guard_checks on public.entries;
create trigger entries_guard_checks before update on public.entries
  for each row execute function public.entries_guard_checks();

-- Mark a dose as checked (ok = true) or undo that (ok = false). Admins only.
create or replace function public.ack_entry(entry_id uuid, ok boolean default true)
returns public.entries
language plpgsql security definer
set search_path = public
as $$
declare
  result public.entries;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can mark a dose as checked.';
  end if;
  update public.entries
     set acked_by = case when ok then lower(auth.jwt() ->> 'email') end,
         acked_at = case when ok then now() end
   where id = entry_id and kind in ('long', 'meal')
  returning * into result;
  if result.id is null then
    raise exception 'That dose could not be found.';
  end if;
  return result;
end;
$$;
revoke all on function public.ack_entry(uuid, boolean) from public, anon;
grant execute on function public.ack_entry(uuid, boolean) to authenticated;

-- Doses logged before this feature existed won't trigger alerts.
update public.entries set alerted_at = coalesce(alerted_at, created_at) where alerted_at is null;

grant all on public.entries to service_role;
