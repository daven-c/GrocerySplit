-- Weekly sweep of receipt-photo files nothing points to any more (see functions/sweep-photos).
-- Storage files are not removed when rows are cascade-deleted (a removed group or account), so a function does it.
-- The function is deployed without JWT verification and throttles itself, so the cron call needs no credentials.

create table public.maintenance_runs (job text primary key, last_run timestamptz not null);
alter table public.maintenance_runs enable row level security; -- no policies: only the service role touches it

create extension if not exists pg_net;

select cron.schedule(
  'sweep-photos', '23 4 * * 0',
  $$ select net.http_post(
       url := 'https://hibocxgjmvkiqdeojdfl.supabase.co/functions/v1/sweep-photos',
       headers := jsonb_build_object('Content-Type', 'application/json'),
       body := '{}'::jsonb) $$
);
