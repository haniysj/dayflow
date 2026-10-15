-- DayFlow — push dispatch secret + every-minute cron (idempotent)
-- Replace the two placeholders before running.

insert into dayflow.config(k, v) values ('dispatch_secret', '__DISPATCH_SECRET__')
on conflict (k) do update set v = excluded.v;

insert into dayflow.config(k, v) values ('dispatch_url', '__APP_URL__/api/dispatch')
on conflict (k) do update set v = excluded.v;

create or replace function dayflow.cron_dispatch() returns void
language plpgsql security definer set search_path = dayflow, public as $$
declare u text;
begin
  -- call the dispatcher only when something is actually due
  if not exists (select 1 from dayflow.schedule where sent_at is null and fire_at <= now()) then return; end if;
  select v into u from dayflow.config where k = 'dispatch_url';
  if u is null then return; end if;
  perform net.http_post(url := u, body := '{}'::jsonb, headers := '{"Content-Type":"application/json"}'::jsonb, timeout_milliseconds := 20000);
end $$;
revoke all on function dayflow.cron_dispatch() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'dayflow-dispatch';
select cron.schedule('dayflow-dispatch', '* * * * *', 'select dayflow.cron_dispatch()');
-- ✅ نهاية الجزء 2
