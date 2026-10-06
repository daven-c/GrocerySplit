-- Quick splits made while signed in (or claimed later with the owner key) belong to the account, so they show up in
-- the Personal section until they expire, and the owner can manage them from any device without the owner key.

alter table public.quick_splits add column owner_user uuid references public.profiles(id) on delete set null;
create index quick_splits_owner_user_idx on public.quick_splits(owner_user) where owner_user is not null;

create or replace function public.qs_create(p_title text default 'Dinner') returns table (token text, owner_key text)
language plpgsql security definer set search_path = '' as $$
declare t text; k text;
begin
  delete from public.quick_splits where updated_at < now() - interval '30 days';
  if (select count(*) from public.quick_splits where created_at > now() - interval '1 hour') >= 300 then
    raise exception 'Too many new splits right now. Try again in a few minutes.';
  end if;
  t := replace(gen_random_uuid()::text, '-', '');
  k := replace(gen_random_uuid()::text, '-', '');
  insert into public.quick_splits (token, owner_hash, title, owner_user)
  values (t, sha256(convert_to(k, 'utf8')), coalesce(nullif(btrim(p_title), ''), 'Dinner'), (select auth.uid()));
  return query select t, k;
end $$;

-- The owner is whoever holds the owner key, or the signed-in account that owns the split.
create function public._qs_is_owner(s public.quick_splits, p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select s.owner_hash = sha256(convert_to(coalesce(p_key, ''), 'utf8'))
      or (s.owner_user is not null and s.owner_user = (select auth.uid()))
$$;
revoke execute on function public._qs_is_owner(public.quick_splits, text) from public, anon, authenticated;

create or replace function public.qs_lock(p_token text, p_owner_key text, p_locked boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.quick_splits;
begin
  s := public._qs_load(p_token, false);
  if not public._qs_is_owner(s, p_owner_key) then raise exception 'Only the owner can lock this split.'; end if;
  update public.quick_splits set locked = p_locked where id = s.id;
  perform public._qs_touch(s.id);
end $$;

create or replace function public.qs_delete(p_token text, p_owner_key text) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.quick_splits;
begin
  s := public._qs_load(p_token, false);
  if not public._qs_is_owner(s, p_owner_key) then raise exception 'Only the owner can delete this split.'; end if;
  delete from public.quick_splits where id = s.id;
end $$;

create or replace function public.qs_rename(p_token text, p_owner_key text, p_title text) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.quick_splits; t text := btrim(coalesce(p_title, ''));
begin
  s := public._qs_load(p_token, false);
  if not public._qs_is_owner(s, p_owner_key) then raise exception 'Only the owner can rename this split.'; end if;
  if length(t) < 1 or length(t) > 80 then raise exception 'Titles are 1 to 80 characters.'; end if;
  update public.quick_splits set title = t where id = s.id;
  perform public._qs_touch(s.id);
end $$;

-- A signed-in owner attaches a split they made anonymously (or on another device) to their account.
create function public.qs_claim(p_token text, p_owner_key text) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.quick_splits;
begin
  if (select auth.uid()) is null then raise exception 'Sign in first.'; end if;
  s := public._qs_load(p_token, false);
  if s.owner_hash <> sha256(convert_to(coalesce(p_owner_key, ''), 'utf8')) then raise exception 'Only the owner can claim this split.'; end if;
  if s.owner_user is null then update public.quick_splits set owner_user = (select auth.uid()) where id = s.id; end if;
end $$;
revoke execute on function public.qs_claim(text, text) from public, anon;
grant execute on function public.qs_claim(text, text) to authenticated;

-- The signed-in user's own quick splits that have not expired, newest activity first.
create function public.my_quick_splits() returns table (token text, title text, locked boolean, people int, items int, total numeric, updated_at timestamptz, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select q.token, q.title, q.locked,
         (select count(*)::int from public.quick_split_people p where p.split_id = q.id),
         (select count(*)::int from public.quick_split_items i where i.split_id = q.id),
         coalesce((select sum(i.price) from public.quick_split_items i where i.split_id = q.id), 0) + q.tax + q.tip,
         q.updated_at, q.updated_at + interval '30 days'
  from public.quick_splits q
  where q.owner_user = (select auth.uid()) and q.updated_at > now() - interval '30 days'
  order by q.updated_at desc
$$;
revoke execute on function public.my_quick_splits() from public, anon;
grant execute on function public.my_quick_splits() to authenticated;

-- qs_get also says whether the caller owns the split (by account).
create or replace function public.qs_get(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.quick_splits;
begin
  select * into s from public.quick_splits where token = p_token and updated_at > now() - interval '30 days';
  if not found then return null; end if;
  return jsonb_build_object(
    'title', s.title, 'tax', s.tax, 'tip', s.tip, 'paid_by', s.paid_by, 'locked', s.locked,
    'version', s.version, 'created_at', s.created_at, 'expires_at', s.updated_at + interval '30 days',
    'is_owner', s.owner_user is not null and s.owner_user = (select auth.uid()),
    'people', coalesce((select jsonb_agg(p.name order by p.created_at, p.name) from public.quick_split_people p where p.split_id = s.id), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'price', i.price, 'assigned', to_jsonb(i.assigned)) order by i.pos)
                       from public.quick_split_items i where i.split_id = s.id), '[]'::jsonb)
  );
end $$;
