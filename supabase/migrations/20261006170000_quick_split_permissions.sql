-- Quick split permissions. The link lets anyone look and join, but:
--   * everything about the split itself (items, prices, tax, tip, who paid, removing people, "everyone") is the owner's;
--   * everyone else can only tap items onto or off THEMSELVES. Joining returns a private member key (stored in that
--     browser), and tapping someone's name needs that person's key, so people can't deselect each other.
-- The owner (owner key, or the signed-in account that owns the split) can act for anyone.

alter table public.quick_split_people add column key_hash bytea;

-- The old open versions must go, or they would still be callable.
drop function public.qs_join(text, text);
drop function public.qs_remove_person(text, text);
drop function public.qs_set(text, jsonb);
drop function public.qs_add_items(text, jsonb);
drop function public.qs_update_item(text, uuid, jsonb);
drop function public.qs_delete_item(text, uuid);
drop function public.qs_assign(text, uuid, text, boolean);
drop function public.qs_set_assigned(text, uuid, text[]);

create function public.qs_join(p_token text, p_name text) returns text
language plpgsql security definer set search_path = '' as $$
declare s public.quick_splits; n text := btrim(p_name); k text;
begin
  s := public._qs_load(p_token, true);
  if length(n) < 1 or length(n) > 30 then raise exception 'Names are 1 to 30 characters.'; end if;
  if (select count(*) from public.quick_split_people where split_id = s.id) >= 60 then raise exception 'This split is full.'; end if;
  k := replace(gen_random_uuid()::text, '-', '');
  begin
    insert into public.quick_split_people (split_id, name, key_hash) values (s.id, n, sha256(convert_to(k, 'utf8')));
  exception when unique_violation then
    raise exception 'That name is taken.';
  end;
  perform public._qs_touch(s.id);
  return k; -- shown once; only its hash is stored
end $$;

create function public.qs_remove_person(p_token text, p_name text, p_owner_key text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.quick_splits;
begin
  s := public._qs_load(p_token, true);
  if not public._qs_is_owner(s, p_owner_key) then raise exception 'Only the owner can remove people.'; end if;
  delete from public.quick_split_people where split_id = s.id and name = p_name;
  update public.quick_split_items set assigned = array_remove(assigned, p_name) where split_id = s.id;
  update public.quick_splits set paid_by = null where id = s.id and paid_by = p_name;
  perform public._qs_touch(s.id);
end $$;

-- Tax, tip and who paid (a title change still goes through qs_rename).
create function public.qs_set(p_token text, p_patch jsonb, p_owner_key text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.quick_splits; pb text;
begin
  s := public._qs_load(p_token, true);
  if not public._qs_is_owner(s, p_owner_key) then raise exception 'Only the owner can change this.'; end if;
  if p_patch ? 'title' then raise exception 'Only the owner can rename this split.'; end if;
  if p_patch ? 'paid_by' then
    pb := nullif(btrim(p_patch ->> 'paid_by'), '');
    if pb is not null and not exists (select 1 from public.quick_split_people where split_id = s.id and name = pb) then
      raise exception 'Whoever paid has to be on the split.';
    end if;
  else
    pb := s.paid_by;
  end if;
  update public.quick_splits set
    tax = case when p_patch ? 'tax' then (p_patch ->> 'tax')::numeric else tax end,
    tip = case when p_patch ? 'tip' then (p_patch ->> 'tip')::numeric else tip end,
    paid_by = pb
  where id = s.id;
  perform public._qs_touch(s.id);
end $$;

create function public.qs_add_items(p_token text, p_items jsonb, p_owner_key text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.quick_splits; r jsonb;
begin
  s := public._qs_load(p_token, true);
  if not public._qs_is_owner(s, p_owner_key) then raise exception 'Only the owner can add items.'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Items must be a list.'; end if;
  if (select count(*) from public.quick_split_items where split_id = s.id) + jsonb_array_length(p_items) > 200 then
    raise exception 'A split can have up to 200 items.';
  end if;
  for r in select * from jsonb_array_elements(p_items) loop
    insert into public.quick_split_items (split_id, name, price) values (s.id, btrim(r ->> 'name'), (r ->> 'price')::numeric);
  end loop;
  perform public._qs_touch(s.id);
end $$;

create function public.qs_update_item(p_token text, p_item uuid, p_patch jsonb, p_owner_key text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.quick_splits;
begin
  s := public._qs_load(p_token, true);
  if not public._qs_is_owner(s, p_owner_key) then raise exception 'Only the owner can edit items.'; end if;
  update public.quick_split_items set
    name = case when p_patch ? 'name' then btrim(p_patch ->> 'name') else name end,
    price = case when p_patch ? 'price' then (p_patch ->> 'price')::numeric else price end
  where id = p_item and split_id = s.id;
  perform public._qs_touch(s.id);
end $$;

create function public.qs_delete_item(p_token text, p_item uuid, p_owner_key text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.quick_splits;
begin
  s := public._qs_load(p_token, true);
  if not public._qs_is_owner(s, p_owner_key) then raise exception 'Only the owner can delete items.'; end if;
  delete from public.quick_split_items where id = p_item and split_id = s.id;
  perform public._qs_touch(s.id);
end $$;

-- Tap a person onto or off an item: the owner for anyone, everyone else only for themselves (with their member key).
create function public.qs_assign(p_token text, p_item uuid, p_person text, p_on boolean, p_member_key text default null, p_owner_key text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.quick_splits; pk bytea;
begin
  s := public._qs_load(p_token, true);
  select key_hash into pk from public.quick_split_people where split_id = s.id and name = p_person;
  if not found then raise exception 'That person is not on the split.'; end if;
  if not (public._qs_is_owner(s, p_owner_key) or (pk is not null and pk = sha256(convert_to(coalesce(p_member_key, ''), 'utf8')))) then
    raise exception 'You can only choose items for yourself.';
  end if;
  update public.quick_split_items set assigned = case
      when p_on and not (p_person = any(assigned)) then array_append(assigned, p_person)
      when not p_on then array_remove(assigned, p_person)
      else assigned end
    where id = p_item and split_id = s.id;
  perform public._qs_touch(s.id);
end $$;

-- "Everyone" / "nobody" for an item: owner only.
create function public.qs_set_assigned(p_token text, p_item uuid, p_people text[], p_owner_key text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.quick_splits;
begin
  s := public._qs_load(p_token, true);
  if not public._qs_is_owner(s, p_owner_key) then raise exception 'Only the owner can assign other people.'; end if;
  update public.quick_split_items set assigned = coalesce((
      select array_agg(p.name order by p.created_at, p.name) from public.quick_split_people p
      where p.split_id = s.id and p.name = any(p_people)), '{}')
    where id = p_item and split_id = s.id;
  perform public._qs_touch(s.id);
end $$;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('qs_join', 'qs_remove_person', 'qs_set', 'qs_add_items', 'qs_update_item', 'qs_delete_item', 'qs_assign', 'qs_set_assigned')
  loop
    execute format('revoke execute on function %s from public', f.sig);
    execute format('grant execute on function %s to anon, authenticated', f.sig);
  end loop;
end $$;
