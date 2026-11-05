-- Dose Log: run the libre-sync function every 5 minutes.
-- Replace PASTE_SYNC_SECRET with the same value you saved as the SYNC_SECRET
-- secret, then run in Supabase > SQL Editor. Never commit the real secret.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('libre-sync') where exists (select 1 from cron.job where jobname = 'libre-sync');

select cron.schedule(
  'libre-sync',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://gvcuzzxtjmbskidbeedp.supabase.co/functions/v1/libre-sync',
    headers := jsonb_build_object('content-type', 'application/json', 'x-sync-secret', 'PASTE_SYNC_SECRET'),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);
