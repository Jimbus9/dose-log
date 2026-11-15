-- Dose Log: check for reminders every 5 minutes.
-- Replace PASTE_YOUR_PROJECT_REF with your project ref (the part before .supabase.co in
-- your project URL) and PASTE_SYNC_SECRET with your SYNC_SECRET value, then run in
-- Supabase > SQL Editor. Never commit the real secret.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('reminders') where exists (select 1 from cron.job where jobname = 'reminders');

select cron.schedule(
  'reminders',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://PASTE_YOUR_PROJECT_REF.supabase.co/functions/v1/reminders',
    headers := jsonb_build_object('content-type', 'application/json', 'x-sync-secret', 'PASTE_SYNC_SECRET'),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);
