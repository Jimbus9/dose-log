-- Dose Log: reminder notifications
-- Run in Supabase > SQL Editor (after setup.sql). Safe to run again.
-- Reminders go only to phones signed in with the "Logs doses" (dad) role.

alter table public.settings
  add column if not exists reminders_on     boolean not null default true,
  add column if not exists remind_breakfast time    not null default '10:00',
  add column if not exists remind_lunch     time    not null default '15:00',
  add column if not exists remind_evening   time    not null default '19:00',
  add column if not exists remind_long      time    not null default '20:00';

-- One row per phone that has turned reminders on.
create table if not exists public.push_subscriptions (
  endpoint    text primary key,
  p256dh      text not null,
  auth        text not null,
  email       text not null default lower(auth.jwt() ->> 'email'),
  created_at  timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
drop policy if exists "own phone subscriptions" on public.push_subscriptions;
create policy "own phone subscriptions" on public.push_subscriptions for all to authenticated
  using (email = lower(auth.jwt() ->> 'email') and public.is_member())
  with check (email = lower(auth.jwt() ->> 'email') and public.is_member());

-- Stops the same reminder being sent twice in a day. Only the reminders
-- function can see it.
create table if not exists public.reminder_log (
  day      date not null,
  kind     text not null,
  sent_at  timestamptz not null default now(),
  primary key (day, kind)
);
alter table public.reminder_log enable row level security;
revoke all on public.reminder_log from anon, authenticated;
