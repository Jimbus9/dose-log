-- Dose Log: notify everyone on the family list when the journal changes.
-- Run once in Supabase > SQL Editor (after 13-integrity.sql). Safe to run again.
--
-- The reminders function (every 5 minutes) sends one notification per new or
-- edited journal entry to every phone that has notifications on, except the
-- phones of whoever made the change. These columns let it know who changed what,
-- and which changes it has already told people about.

alter table public.journal
  add column if not exists edited_by   text,          -- set by the database: who last added or changed it
  add column if not exists notified_at timestamptz;   -- set by the reminders function once people were told

-- From the app: record who made the change and when; the app can't fake either,
-- or mark a change as already notified.
create or replace function public.journal_stamp_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.edited_by := lower(auth.jwt() ->> 'email');
    if tg_op = 'INSERT' then
      new.notified_at := null;
    else
      new.updated_at  := now();
      new.notified_at := old.notified_at;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists journal_stamp_change on public.journal;
create trigger journal_stamp_change before insert or update on public.journal
  for each row execute function public.journal_stamp_change();

-- Entries written before this existed don't trigger notifications.
update public.journal
   set notified_at = coalesce(notified_at, updated_at, now()),
       edited_by   = coalesce(edited_by, written_by);

grant all on public.journal to service_role;
