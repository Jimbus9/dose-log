-- Dose Log: admin role. Only admins can change settings and the family list.
-- Run once in Supabase > SQL Editor. Safe to run again.
-- Change the email on the last line to whoever should be the first admin.

alter table public.members drop constraint if exists members_role_check;
alter table public.members add constraint members_role_check check (role in ('dad', 'family', 'admin'));

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.members
    where email = lower(auth.jwt() ->> 'email') and role = 'admin'
  );
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

drop policy if exists "family adds members"    on public.members;
drop policy if exists "family edits members"   on public.members;
drop policy if exists "family removes members" on public.members;
drop policy if exists "admin adds members"     on public.members;
drop policy if exists "admin edits members"    on public.members;
drop policy if exists "admin removes members"  on public.members;
create policy "admin adds members" on public.members for insert to authenticated
  with check (public.is_admin());
-- admins can't change or remove their own row, so the last admin can't lock everyone out
create policy "admin edits members" on public.members for update to authenticated
  using (public.is_admin() and email <> lower(auth.jwt() ->> 'email'))
  with check (public.is_admin());
create policy "admin removes members" on public.members for delete to authenticated
  using (public.is_admin() and email <> lower(auth.jwt() ->> 'email'));

drop policy if exists "family edits settings" on public.settings;
drop policy if exists "admin edits settings"  on public.settings;
create policy "admin edits settings" on public.settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

update public.members set role = 'admin' where email = 'you@example.com';
