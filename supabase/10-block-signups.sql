-- Dose Log: only people on the family list can create an account.
-- Without this, anyone who finds your site can type in an email and Supabase
-- creates an account and sends a code. They still couldn't see any data, but
-- this stops the junk accounts and the wasted emails.
-- Run once in Supabase > SQL Editor. Safe to run again.
-- Add the person to the family list BEFORE they first sign in. Existing
-- accounts are not affected.

create or replace function public.block_unlisted_signups()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.members where email = lower(new.email)
  ) then
    raise exception 'This email is not on the family list.';
  end if;
  return new;
end;
$$;
revoke all on function public.block_unlisted_signups() from public, anon, authenticated;

drop trigger if exists block_unlisted_signups on auth.users;
create trigger block_unlisted_signups
  before insert on auth.users
  for each row execute function public.block_unlisted_signups();

-- To undo: drop trigger block_unlisted_signups on auth.users;
