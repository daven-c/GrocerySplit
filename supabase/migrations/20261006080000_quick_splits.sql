-- Quick splits: a single shareable page for splitting one bill, no account and no group.
-- The long random token in the link is the only credential: anyone holding it can read and edit. Nobody (signed in
-- or not) can touch these tables directly; every read and write goes through the qs_* functions below, which each
-- take the token. A split the owner has locked is read-only until they unlock it, and a split nobody has touched
-- for 30 days disappears.

create table public.quick_splits (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  owner_hash bytea not null,
  title text not null default 'Dinner' check (length(btrim(title)) between 1 and 80),
  tax numeric(10,2) not null default 0 check (tax >= 0 and tax <= 100000),
  tip numeric(10,2) not null default 0 check (tip >= 0 and tip <= 100000),
  paid_by text,
  locked boolean not null default false,
  version int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index quick_splits_updated_idx on public.quick_splits(updated_at);

create table public.quick_split_people (
  split_id uuid not null references public.quick_splits(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 30 and name = btrim(name)),
  created_at timestamptz not null default now(),
  primary key (split_id, name)
);
create unique index quick_split_people_unique_name on public.quick_split_people(split_id, lower(name));

create table public.quick_split_items (
  id uuid primary key default gen_random_uuid(),
  split_id uuid not null references public.quick_splits(id) on delete cascade,
  pos bigint generated always as identity,
  name text not null check (length(btrim(name)) between 1 and 80),
  price numeric(10,2) not null check (price >= 0 and price <= 100000),
  assigned text[] not null default '{}'
);
create index quick_split_items_split_idx on public.quick_split_items(split_id);

-- RLS on with no policies: the tables are closed to everyone except the functions below.
alter table public.quick_splits enable row level security;
alter table public.quick_split_people enable row level security;
alter table public.quick_split_items enable row level security;
revoke all on public.quick_splits, public.quick_split_people, public.quick_split_items from anon, authenticated;

-- Internal: the live (not expired) split for a token, optionally for writing (must not be locked).
create function public._qs_load(p_token text, p_write boolean) returns public.quick_splits
language plpgsql security definer set search_path = '' as $$
declare s public.quick_splits;
begin
  select * into s from public.quick_splits
    where token = p_token and updated_at > now() - interval '30 days' for update;
  if not found then raise exception 'This split was not found, or it has expired.'; end if;
  if p_write and s.locked then raise exception 'This split is locked by its owner.'; end if;
  return s;
end $$;
revoke execute on function public._qs_load(text, boolean) from public, anon, authenticated;

create function public._qs_touch(p_id uuid) returns void
language sql security definer set search_path = '' as $$
  update public.quick_splits set updated_at = now(), version = version + 1 where id = p_id
$$;
revoke execute on function public._qs_touch(uuid) from public, anon, authenticated;

create function public.qs_create(p_title text default 'Dinner') returns table (token text, owner_key text)
language plpgsql security definer set search_path = '' as $$
declare t text; k text;
begin
  delete from public.quick_splits where updated_at < now() - interval '30 days';
  if (select count(*) from public.quick_splits where created_at > now() - interval '1 hour') >= 300 then
    raise exception 'Too many new splits right now. Try again in a few minutes.';
  end if;
  t := replace(gen_random_uuid()::text, '-', '');
  k := replace(gen_random_uuid()::text, '-', '');
  insert into public.quick_splits (token, owner_hash, title)
  values (t, sha256(convert_to(k, 'utf8')), coalesce(nullif(btrim(p_title), ''), 'Dinner'));
  return query select t, k;
end $$;

create function public.qs_get(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.quick_splits;
begin
  select * into s from public.quick_splits where token = p_token and updated_at > now() - interval '30 days';
  if not found then return null; end if;
  return jsonb_build_object(
    'title', s.title, 'tax', s.tax, 'tip', s.tip, 'paid_by', s.paid_by, 'locked', s.locked,
    'version', s.version, 'created_at', s.created_at, 'expires_at', s.updated_at + interval '30 days',
    'people', coalesce((select jsonb_agg(p.name order by p.created_at, p.name) from public.quick_split_people p where p.split_id = s.id), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'price', i.price, 'assigned', to_jsonb(i.assigned)) order by i.pos)
                       from public.quick_split_items i where i.split_id = s.id), '[]'::jsonb)
  );
end $$;

-- Names are unique within a split (ignoring case); they are how people are identified.
create function public.qs_join(p_token text, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.quick_splits; n text := btrim(p_name);
begin
  s := public._qs_load(p_token, true);
  if length(n) < 1 or length(n) > 30 then raise exception 'Names are 1 to 30 characters.'; end if;
  if (select count(*) from public.quick_split_people where split_id = s.id) >= 60 then raise exception 'This split is full.'; end if;
  begin
    insert into public.quick_split_people (split_id, name) values (s.id, n);
  exception when unique_violation then
    raise exception 'That name is taken.';
  end;
  perform public._qs_touch(s.id);
end $$;

create function public.qs_remove_person(p_token text, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.quick_splits;
begin
  s := public._qs_load(p_token, true);
  delete from public.quick_split_people where split_id = s.id and name = p_name;
  update public.quick_split_items set assigned = array_remove(assigned, p_name) where split_id = s.id;
  update public.quick_splits set paid_by = null where id = s.id and paid_by = p_name;
  perform public._qs_touch(s.id);
end $$;

-- Patch any of: title, tax, tip, paid_by (null or '' clears it).
create function public.qs_set(p_token text, p_patch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.quick_splits; pb text;
begin
  s := public._qs_load(p_token, true);
  if p_patch ? 'paid_by' then
    pb := nullif(btrim(p_patch ->> 'paid_by'), '');
    if pb is not null and not exists (select 1 from public.quick_split_people where split_id = s.id and name = pb) then
      raise exception 'Whoever paid has to be on the split.';
    end if;
  else
    pb := s.paid_by;
  end if;
  update public.quick_splits set
    title = case when p_patch ? 'title' then coalesce(nullif(btrim(p_patch ->> 'title'), ''), title) else title end,
    tax = case when p_patch ? 'tax' then (p_patch ->> 'tax')::numeric else tax end,
    tip = case when p_patch ? 'tip' then (p_patch ->> 'tip')::numeric else tip end,
    paid_by = pb
  where id = s.id;
  perform public._qs_touch(s.id);
end $$;

-- Add several items at once: [{ "name": "...", "price": 1.23 }, ...]
create function public.qs_add_items(p_token text, p_items jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.quick_splits; r jsonb;
begin
  s := public._qs_load(p_token, true);
  if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Items must be a list.'; end if;
  if (select count(*) from public.quick_split_items where split_id = s.id) + jsonb_array_length(p_items) > 200 then
    raise exception 'A split can have up to 200 items.';
  end if;
  for r in select * from jsonb_array_elements(p_items) loop
    insert into public.quick_split_items (split_id, name, price) values (s.id, btrim(r ->> 'name'), (r ->> 'price')::numeric);
  end loop;
  perform public._qs_touch(s.id);
end $$;

create function public.qs_update_item(p_token text, p_item uuid, p_patch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.quick_splits;
begin
  s := public._qs_load(p_token, true);
  update public.quick_split_items set
    name = case when p_patch ? 'name' then btrim(p_patch ->> 'name') else name end,
    price = case when p_patch ? 'price' then (p_patch ->> 'price')::numeric else price end
  where id = p_item and split_id = s.id;
  perform public._qs_touch(s.id);
end $$;

create function public.qs_delete_item(p_token text, p_item uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.quick_splits;
begin
  s := public._qs_load(p_token, true);
  delete from public.quick_split_items where id = p_item and split_id = s.id;
  perform public._qs_touch(s.id);
end $$;

-- Tap one person on or off an item. Atomic, so two people tapping at once never undo each other.
create function public.qs_assign(p_token text, p_item uuid, p_person text, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.quick_splits;
begin
  s := public._qs_load(p_token, true);
  if not exists (select 1 from public.quick_split_people where split_id = s.id and name = p_person) then
    raise exception 'That person is not on the split.';
  end if;
  update public.quick_split_items set assigned = case
      when p_on and not (p_person = any(assigned)) then array_append(assigned, p_person)
      when not p_on then array_remove(assigned, p_person)
      else assigned end
    where id = p_item and split_id = s.id;
  perform public._qs_touch(s.id);
end $$;

-- Replace an item's whole list of people (for "everyone" / "nobody").
create function public.qs_set_assigned(p_token text, p_item uuid, p_people text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.quick_splits;
begin
  s := public._qs_load(p_token, true);
  update public.quick_split_items set assigned = coalesce((
      select array_agg(p.name order by p.created_at, p.name) from public.quick_split_people p
      where p.split_id = s.id and p.name = any(p_people)), '{}')
    where id = p_item and split_id = s.id;
  perform public._qs_touch(s.id);
end $$;

-- Owner only: the owner key is returned once, by qs_create, and only its hash is stored.
create function public.qs_lock(p_token text, p_owner_key text, p_locked boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.quick_splits;
begin
  s := public._qs_load(p_token, false);
  if s.owner_hash <> sha256(convert_to(coalesce(p_owner_key, ''), 'utf8')) then raise exception 'Only the owner can lock this split.'; end if;
  update public.quick_splits set locked = p_locked where id = s.id;
  perform public._qs_touch(s.id);
end $$;

create function public.qs_delete(p_token text, p_owner_key text) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.quick_splits;
begin
  s := public._qs_load(p_token, false);
  if s.owner_hash <> sha256(convert_to(coalesce(p_owner_key, ''), 'utf8')) then raise exception 'Only the owner can delete this split.'; end if;
  delete from public.quick_splits where id = s.id;
end $$;

-- Callable by anyone holding a token (signed in or not).
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'qs\_%'
  loop
    execute format('revoke execute on function %s from public', f.sig);
    execute format('grant execute on function %s to anon, authenticated', f.sig);
  end loop;
end $$;
