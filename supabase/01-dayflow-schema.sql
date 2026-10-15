-- DayFlow — schema, sync and push RPCs (idempotent)
-- All tables live in the private schema "dayflow"; anon reaches them only through public.df_* functions.

create extension if not exists pgcrypto with schema extensions;
create schema if not exists dayflow;
revoke all on schema dayflow from public, anon, authenticated;

create table if not exists dayflow.config (k text primary key, v text not null);

create table if not exists dayflow.devices (
  token_hash text primary key,
  name text,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

create table if not exists dayflow.records (
  id text primary key,
  kind text not null,
  data jsonb not null,
  client_updated bigint not null,
  deleted boolean not null default false,
  seq bigserial,
  server_updated timestamptz not null default now()
);
create index if not exists records_seq_idx on dayflow.records(seq);

create table if not exists dayflow.push_subs (
  endpoint text primary key,
  sub jsonb not null,
  device text,
  created_at timestamptz not null default now()
);

create table if not exists dayflow.schedule (
  id text primary key,
  fire_at timestamptz not null,
  title text not null,
  body text,
  url text,
  sent_at timestamptz
);
create index if not exists schedule_due_idx on dayflow.schedule(fire_at) where sent_at is null;

-- ---------- helpers ----------
create or replace function dayflow.hash_token(p text) returns text
language sql immutable as $$ select encode(extensions.digest(p, 'sha256'), 'hex') $$;

create or replace function dayflow.new_token(p_device text) returns text
language plpgsql security definer set search_path = dayflow, extensions, public as $$
declare t text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  insert into dayflow.devices(token_hash, name) values (dayflow.hash_token(t), left(coalesce(p_device,'device'),80));
  return t;
end $$;

create or replace function dayflow.assert_token(p_token text) returns void
language plpgsql security definer set search_path = dayflow, extensions, public as $$
begin
  update dayflow.devices set last_seen = now() where token_hash = dayflow.hash_token(coalesce(p_token,''));
  if not found then raise exception 'DF_AUTH' using errcode = '28000'; end if;
end $$;

create or replace function dayflow.assert_secret(p_secret text) returns void
language plpgsql security definer set search_path = dayflow, extensions, public as $$
begin
  if p_secret is null or not exists (select 1 from dayflow.config where k='dispatch_secret' and v = p_secret) then
    raise exception 'DF_SECRET' using errcode = '28000';
  end if;
end $$;

-- ---------- auth ----------
create or replace function public.df_status() returns jsonb
language sql security definer set search_path = dayflow, public as $$
  select jsonb_build_object('has_password', exists(select 1 from dayflow.config where k='pass_hash'))
$$;

create or replace function public.df_setup(p_pass text, p_device text) returns text
language plpgsql security definer set search_path = dayflow, extensions, public as $$
begin
  if length(coalesce(p_pass,'')) < 6 then raise exception 'DF_SHORT'; end if;
  if exists(select 1 from dayflow.config where k='pass_hash') then raise exception 'DF_EXISTS'; end if;
  insert into dayflow.config(k,v) values ('pass_hash', extensions.crypt(p_pass, extensions.gen_salt('bf')));
  return dayflow.new_token(p_device);
end $$;

create or replace function public.df_login(p_pass text, p_device text) returns text
language plpgsql security definer set search_path = dayflow, extensions, public as $$
declare h text;
begin
  select v into h from dayflow.config where k='pass_hash';
  if h is null or extensions.crypt(coalesce(p_pass,''), h) <> h then
    perform pg_sleep(0.6);
    raise exception 'DF_BADPASS' using errcode = '28000';
  end if;
  return dayflow.new_token(p_device);
end $$;

create or replace function public.df_logout(p_token text) returns void
language sql security definer set search_path = dayflow, public as $$
  delete from dayflow.push_subs where device = dayflow.hash_token(coalesce(p_token,''));
  delete from dayflow.devices where token_hash = dayflow.hash_token(coalesce(p_token,''));
$$;

create or replace function public.df_change_pass(p_token text, p_old text, p_new text) returns void
language plpgsql security definer set search_path = dayflow, extensions, public as $$
declare h text;
begin
  perform dayflow.assert_token(p_token);
  select v into h from dayflow.config where k='pass_hash';
  if extensions.crypt(coalesce(p_old,''), h) <> h then raise exception 'DF_BADPASS' using errcode='28000'; end if;
  if length(coalesce(p_new,'')) < 6 then raise exception 'DF_SHORT'; end if;
  update dayflow.config set v = extensions.crypt(p_new, extensions.gen_salt('bf')) where k='pass_hash';
end $$;

-- ---------- sync ----------
create or replace function public.df_pull(p_token text, p_cursor bigint) returns jsonb
language plpgsql security definer set search_path = dayflow, public as $$
declare rows jsonb; maxseq bigint;
begin
  perform dayflow.assert_token(p_token);
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'data',data,'u',client_updated,'d',deleted) order by seq), '[]'::jsonb),
         max(seq)
    into rows, maxseq
    from (select * from dayflow.records where seq > coalesce(p_cursor,0) order by seq limit 1000) r;
  return jsonb_build_object('records', rows, 'cursor', coalesce(maxseq, p_cursor, 0),
                            'more', jsonb_array_length(rows) = 1000);
end $$;

create or replace function public.df_push(p_token text, p_records jsonb) returns int
language plpgsql security definer set search_path = dayflow, public as $$
declare n int;
begin
  perform dayflow.assert_token(p_token);
  with src as (
    select r->>'id' as id, r->>'kind' as kind, r->'data' as data,
           (r->>'u')::bigint as u, coalesce((r->>'d')::boolean,false) as d
    from jsonb_array_elements(coalesce(p_records,'[]'::jsonb)) r
  ), up as (
    insert into dayflow.records as t (id, kind, data, client_updated, deleted)
    select id, kind, data, u, d from src
    on conflict (id) do update
      set kind = excluded.kind, data = excluded.data, client_updated = excluded.client_updated,
          deleted = excluded.deleted, seq = nextval(pg_get_serial_sequence('dayflow.records','seq')),
          server_updated = now()
      where excluded.client_updated > t.client_updated
    returning 1
  ) select count(*) into n from up;
  return n;
end $$;

create or replace function public.df_wipe(p_token text, p_pass text) returns void
language plpgsql security definer set search_path = dayflow, extensions, public as $$
declare h text;
begin
  perform dayflow.assert_token(p_token);
  select v into h from dayflow.config where k='pass_hash';
  if extensions.crypt(coalesce(p_pass,''), h) <> h then raise exception 'DF_BADPASS' using errcode='28000'; end if;
  delete from dayflow.records;
  delete from dayflow.schedule;
end $$;

-- ---------- push ----------
create or replace function public.df_save_sub(p_token text, p_sub jsonb) returns void
language plpgsql security definer set search_path = dayflow, public as $$
begin
  perform dayflow.assert_token(p_token);
  insert into dayflow.push_subs(endpoint, sub, device)
  values (p_sub->>'endpoint', p_sub, dayflow.hash_token(p_token))
  on conflict (endpoint) do update set sub = excluded.sub, device = excluded.device;
end $$;

create or replace function public.df_remove_sub(p_token text, p_endpoint text) returns void
language plpgsql security definer set search_path = dayflow, public as $$
begin
  perform dayflow.assert_token(p_token);
  delete from dayflow.push_subs where endpoint = p_endpoint;
end $$;

create or replace function public.df_sub_count(p_token text) returns int
language plpgsql security definer set search_path = dayflow, public as $$
begin
  perform dayflow.assert_token(p_token);
  return (select count(*) from dayflow.push_subs);
end $$;

-- Replace all unsent future reminders with the given list; already-sent ids are kept untouched (no duplicates).
create or replace function public.df_set_schedule(p_token text, p_items jsonb) returns int
language plpgsql security definer set search_path = dayflow, public as $$
declare n int;
begin
  perform dayflow.assert_token(p_token);
  create temp table if not exists _df_items (id text primary key, fire_at timestamptz, title text, body text, url text) on commit drop;
  delete from _df_items;
  insert into _df_items
    select distinct on (i->>'id') i->>'id', (i->>'at')::timestamptz, left(i->>'title',200), left(i->>'body',400), i->>'url'
    from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) i where i->>'id' is not null;
  delete from dayflow.schedule s where s.sent_at is null and not exists (select 1 from _df_items x where x.id = s.id);
  insert into dayflow.schedule as s (id, fire_at, title, body, url)
    select id, fire_at, title, body, url from _df_items
  on conflict (id) do update set fire_at = excluded.fire_at, title = excluded.title, body = excluded.body, url = excluded.url
    where s.sent_at is null;
  delete from dayflow.schedule where sent_at is not null and sent_at < now() - interval '30 days';
  select count(*) into n from dayflow.schedule where sent_at is null;
  return n;
end $$;

-- Called only by the Vercel dispatcher (secret). Marks items as sent atomically, returns items + subscriptions.
create or replace function public.df_claim_due(p_secret text) returns jsonb
language plpgsql security definer set search_path = dayflow, public as $$
declare items jsonb;
begin
  perform dayflow.assert_secret(p_secret);
  with due as (
    update dayflow.schedule set sent_at = now()
    where id in (select id from dayflow.schedule where sent_at is null and fire_at <= now() for update skip locked)
    returning id, fire_at, title, body, url
  ) select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'body',body,'url',url,
                                                  'stale', fire_at < now() - interval '2 hours')), '[]'::jsonb)
    into items from due;
  return jsonb_build_object('items', items,
    'subs', case when jsonb_array_length(items) = 0 then '[]'::jsonb
                 else (select coalesce(jsonb_agg(sub), '[]'::jsonb) from dayflow.push_subs) end);
end $$;

create or replace function public.df_drop_sub(p_secret text, p_endpoint text) returns void
language plpgsql security definer set search_path = dayflow, public as $$
begin
  perform dayflow.assert_secret(p_secret);
  delete from dayflow.push_subs where endpoint = p_endpoint;
end $$;

-- Test push: queue an item due now (the dispatcher picks it up within a minute, or immediately via /api/dispatch?now)
create or replace function public.df_queue_test(p_token text, p_title text, p_body text) returns void
language plpgsql security definer set search_path = dayflow, public as $$
begin
  perform dayflow.assert_token(p_token);
  insert into dayflow.schedule(id, fire_at, title, body, url)
  values ('test-' || extract(epoch from clock_timestamp())::text, now(), left(p_title,200), left(p_body,400), '/');
end $$;

-- ---------- grants ----------
revoke all on all functions in schema dayflow from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array[
    'df_status()', 'df_setup(text,text)', 'df_login(text,text)', 'df_logout(text)',
    'df_change_pass(text,text,text)', 'df_pull(text,bigint)', 'df_push(text,jsonb)', 'df_wipe(text,text)',
    'df_save_sub(text,jsonb)', 'df_remove_sub(text,text)', 'df_sub_count(text)', 'df_set_schedule(text,jsonb)',
    'df_claim_due(text)', 'df_drop_sub(text,text)', 'df_queue_test(text,text,text)']
  loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
-- ✅ نهاية الجزء 1
