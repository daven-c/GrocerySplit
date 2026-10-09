-- Quick split hardening:
--  * expired splits are removed by a daily job (qs_create used to do it, and only when someone created a new one)
--  * creating is limited per visitor (signed-in account, or the connecting IP as seen by the edge), on top of the
--    global cap, so one script can no longer use up everyone's allowance

create extension if not exists pg_cron;

select cron.schedule(
  'quick-splits-expire', '17 3 * * *',
  $$ delete from public.quick_splits where updated_at < now() - interval '30 days' $$
);

alter table public.quick_splits add column creator_key text;
create index quick_splits_creator_idx on public.quick_splits (creator_key, created_at) where creator_key is not null;

-- Who is asking: the account, else a hash of the client IP that the edge reports (never the raw address, and
-- never a client-supplied header). Null when neither is known: then only the global cap applies.
create function public._qs_visitor() returns text
language plpgsql stable security definer set search_path = '' as $$
declare h json; ip text;
begin
  if (select auth.uid()) is not null then return 'u:' || (select auth.uid())::text; end if;
  begin h := nullif(current_setting('request.headers', true), '')::json; exception when others then h := null; end;
  ip := btrim(coalesce(h ->> 'cf-connecting-ip', ''));
  if ip = '' then return null; end if;
  return 'ip:' || encode(sha256(convert_to(ip, 'utf8')), 'hex');
end $$;
revoke execute on function public._qs_visitor() from public, anon, authenticated;

create or replace function public.qs_create(p_title text default 'Dinner') returns table (token text, owner_key text)
language plpgsql security definer set search_path = '' as $$
declare t text; k text; v text := public._qs_visitor();
begin
  if v is not null then
    if (select count(*) from public.quick_splits q where q.creator_key = v and q.created_at > now() - interval '1 hour') >= 10
       or (select count(*) from public.quick_splits q where q.creator_key = v and q.created_at > now() - interval '1 day') >= 40 then
      raise exception 'You have made a lot of quick splits recently. Try again later.';
    end if;
  end if;
  if (select count(*) from public.quick_splits where created_at > now() - interval '1 hour') >= 300 then
    raise exception 'Too many new splits right now. Try again in a few minutes.';
  end if;
  t := replace(gen_random_uuid()::text, '-', '');
  k := replace(gen_random_uuid()::text, '-', '');
  insert into public.quick_splits (token, owner_hash, title, owner_user, creator_key)
  values (t, sha256(convert_to(k, 'utf8')), coalesce(nullif(btrim(p_title), ''), 'Dinner'), (select auth.uid()), v);
  return query select t, k;
end $$;
