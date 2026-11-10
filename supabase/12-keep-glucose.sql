-- Dose Log: keep every glucose reading. Older versions of libre-sync deleted
-- readings after 90 days; this makes the database ignore those deletes, so
-- history is kept even if an old copy of the function is still deployed.
-- Run once in Supabase > SQL Editor. To allow deleting again: drop rule keep_glucose on public.glucose;
create or replace rule keep_glucose as on delete to public.glucose do instead nothing;
