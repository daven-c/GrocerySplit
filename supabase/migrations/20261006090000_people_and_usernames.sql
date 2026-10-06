-- Usernames, name-only people, merging people, and a private Personal group.
--
--  * profiles.username: unique, lowercase, 3-20 of a-z 0-9 _. Display name stays free text; email stays private to
--    the account (people invite by either email or @username).
--  * group_guests.email becomes optional: a person can be just a name (nobody is notified, nobody sees anything).
--  * add / rename / remove / merge / invite a person, all owner-only and all through functions.
--  * groups.personal: one private group per user, never shared, for tracking what you paid for people by name.

-- ---------------------------------------------------------------- usernames
alter table public.profiles add column username text;
alter table public.profiles add constraint profiles_username_format check (username is null or username ~ '^[a-z0-9_]{3,20}$');
create unique index profiles_username_uq on public.profiles (username);

-- A free username near `base`.
create function public._unique_username(base text) returns text
language plpgsql set search_path = '' as $$
declare b text; candidate text; n int := 1;
begin
  b := regexp_replace(lower(coalesce(base, '')), '[^a-z0-9_]', '', 'g');
  if length(b) < 3 then b := b || 'user'; end if;
  b := left(b, 16);
  candidate := b;
  while exists (select 1 from public.profiles where username = candidate) loop
    n := n + 1;
    candidate := b || n::text;
  end loop;
  return candidate;
end $$;
revoke execute on function public._unique_username(text) from public, anon, authenticated;

update public.profiles p set username = public._unique_username(split_part(p.email, '@', 1)) where p.username is null;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare wanted text := lower(btrim(new.raw_user_meta_data ->> 'username'));
begin
  if wanted is null or wanted !~ '^[a-z0-9_]{3,20}$' or exists (select 1 from public.profiles where username = wanted) then
    wanted := public._unique_username(split_part(new.email, '@', 1));
  end if;
  insert into public.profiles (id, name, email, username)
  values (new.id,
          coalesce(nullif(btrim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)),
          lower(new.email), wanted)
  on conflict (id) do nothing;
  return new;
end $$;

-- For the sign-up and account forms ("is that username taken?").
create function public.username_available(p_username text) returns boolean
language sql stable security definer set search_path = '' as $$
  select lower(btrim(p_username)) ~ '^[a-z0-9_]{3,20}$'
     and not exists (select 1 from public.profiles where username = lower(btrim(p_username)))
$$;
grant execute on function public.username_available(text) to anon, authenticated;

-- ---------------------------------------------------------------- people
alter table public.group_guests alter column email drop not null;
alter table public.groups add column personal boolean not null default false;
create unique index groups_one_personal_per_owner on public.groups (owner_id) where personal;

-- Is this name already taken by a member or guest of the group (ignoring case)?
create function public._name_taken(gid uuid, nm text, except_guest uuid default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members m join public.profiles p on p.id = m.user_id where m.group_id = gid and lower(p.name) = lower(nm))
      or exists (select 1 from public.group_guests g where g.group_id = gid and lower(g.name) = lower(nm) and g.id is distinct from except_guest)
$$;
revoke execute on function public._name_taken(uuid, text, uuid) from public, anon, authenticated;

create function public._dedupe(arr text[]) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(array_agg(x order by o), '{}') from (select x, min(o) as o from unnest(arr) with ordinality t(x, o) group by x) q
$$;
revoke execute on function public._dedupe(text[]) from public, anon, authenticated;

-- Move everything one person was part of onto another (used when someone joins, and when two people are merged).
create function public._remap_person(gid uuid, from_id uuid, from_name text, to_id uuid, to_name text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.claiming', '1', true); -- keeps the transfer ledger from logging this as an edit
  update public.sessions set paid_by = to_id where group_id = gid and paid_by = from_id;
  update public.sessions
    set split_data = (split_data - from_id::text) || jsonb_build_object(to_id::text,
          coalesce((split_data ->> to_id::text)::numeric, 0) + (split_data ->> from_id::text)::numeric)
    where group_id = gid and kind = 'expense' and split_data ? from_id::text;
  update public.settlements set from_user = to_id where group_id = gid and from_user = from_id;
  update public.settlements set to_user = to_id where group_id = gid and to_user = from_id;
  update public.settlement_log set from_user = to_id where group_id = gid and from_user = from_id;
  update public.settlement_log set to_user = to_id where group_id = gid and to_user = from_id;
  update public.settlement_log set prev_from_user = to_id where group_id = gid and prev_from_user = from_id;
  update public.settlement_log set prev_to_user = to_id where group_id = gid and prev_to_user = from_id;
  if from_name is distinct from to_name then
    update public.sessions set participants = public._dedupe(array_replace(participants, from_name, to_name)) where group_id = gid;
    update public.items set assigned_users = public._dedupe(array_replace(assigned_users, from_name, to_name))
      where session_id in (select id from public.sessions where group_id = gid);
  end if;
  perform set_config('app.claiming', '', true);
end $$;
revoke execute on function public._remap_person(uuid, uuid, text, uuid, text) from public, anon, authenticated;

create or replace function public.respond_to_invite(invite_id uuid, accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  inv public.group_invites;
  g public.group_guests;
  uid uuid := (select auth.uid());
  pname text;
begin
  select * into inv from public.group_invites
  where id = invite_id and status = 'pending' and email = lower((select auth.jwt()) ->> 'email')
  for update;
  if not found then raise exception 'Invite not found or already answered'; end if;
  update public.group_invites
    set status = case when accept then 'accepted' else 'declined' end, responded_at = now()
    where id = invite_id;

  if not accept then
    perform public.drop_guest(inv.group_id, inv.email);
    return;
  end if;

  insert into public.group_members (group_id, user_id) values (inv.group_id, uid) on conflict do nothing;

  select * into g from public.group_guests where group_id = inv.group_id and email = inv.email;
  if found then
    select name into pname from public.profiles where id = uid;
    perform public._remap_person(inv.group_id, g.id, g.name, uid, coalesce(pname, g.name));
    delete from public.group_guests where id = g.id;
  end if;
end $$;

-- An invite attached to an existing name-only person must not create a second person.
create or replace function public.invite_creates_guest() returns trigger
language plpgsql security definer set search_path = '' as $$
declare base text; candidate text; n int := 1;
begin
  if current_setting('app.attach_guest', true) = '1' then return new; end if;
  base := coalesce(nullif(btrim(new.guest_name), ''), split_part(new.email, '@', 1));
  candidate := base;
  while public._name_taken(new.group_id, candidate) loop
    n := n + 1;
    candidate := base || ' ' || n;
  end loop;
  insert into public.group_guests (group_id, email, name, invited_by)
  values (new.group_id, new.email, candidate, new.invited_by)
  on conflict (group_id, email) do nothing;
  return new;
end $$;

create function public.add_guest(p_group uuid, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare n text := btrim(p_name); gid uuid;
begin
  if not public.is_group_owner(p_group) then raise exception 'Only the group owner can add people.'; end if;
  if length(n) < 1 or length(n) > 60 then raise exception 'Names are 1 to 60 characters.'; end if;
  if public._name_taken(p_group, n) then raise exception 'Someone in this group already has that name.'; end if;
  insert into public.group_guests (group_id, name) values (p_group, n) returning id into gid;
  return gid;
end $$;

create function public.rename_guest(p_guest uuid, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare g public.group_guests; n text := btrim(p_name);
begin
  select * into g from public.group_guests where id = p_guest;
  if not found or not public.is_group_owner(g.group_id) then raise exception 'Only the group owner can rename people.'; end if;
  if length(n) < 1 or length(n) > 60 then raise exception 'Names are 1 to 60 characters.'; end if;
  if public._name_taken(g.group_id, n, g.id) then raise exception 'Someone in this group already has that name.'; end if;
  -- receipts match people by name, so the name changes there too
  update public.sessions set participants = public._dedupe(array_replace(participants, g.name, n)) where group_id = g.group_id;
  update public.items set assigned_users = public._dedupe(array_replace(assigned_users, g.name, n))
    where session_id in (select id from public.sessions where group_id = g.group_id);
  update public.group_guests set name = n where id = g.id;
end $$;

create function public.remove_guest(p_guest uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare g public.group_guests;
begin
  select * into g from public.group_guests where id = p_guest;
  if not found or not public.is_group_owner(g.group_id) then raise exception 'Only the group owner can remove people.'; end if;
  if public.guest_in_use(g.group_id, g.id, g.name) then
    raise exception '% is already in expenses. Merge them into someone else, or delete those first.', g.name;
  end if;
  update public.sessions set participants = array_remove(participants, g.name) where group_id = g.group_id;
  delete from public.group_invites where group_id = g.group_id and email = g.email and status = 'pending';
  delete from public.group_guests where id = g.id;
end $$;

-- "This is the same person as ...": everything moves to the other person (a member or another guest).
create function public.merge_guest(p_guest uuid, p_into uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare g public.group_guests; into_name text;
begin
  select * into g from public.group_guests where id = p_guest;
  if not found or not public.is_group_owner(g.group_id) then raise exception 'Only the group owner can merge people.'; end if;
  if p_into = g.id then raise exception 'Pick someone else to merge into.'; end if;
  select name into into_name from public.group_guests where id = p_into and group_id = g.group_id;
  if into_name is null then
    select p.name into into_name from public.group_members m join public.profiles p on p.id = m.user_id where m.group_id = g.group_id and m.user_id = p_into;
  end if;
  if into_name is null then raise exception 'That person is not in this group.'; end if;
  if exists (select 1 from public.settlements t where t.group_id = g.group_id
             and ((t.from_user = g.id and t.to_user = p_into) or (t.from_user = p_into and t.to_user = g.id))) then
    raise exception 'There are transfers between these two people. Delete those first.';
  end if;
  perform public._remap_person(g.group_id, g.id, g.name, p_into, into_name);
  delete from public.group_invites where group_id = g.group_id and email = g.email and status = 'pending';
  delete from public.group_guests where id = g.id;
end $$;

-- Invite by email or @username. With p_guest, the invite is attached to that existing name-only person.
create function public.invite_person(p_group uuid, p_handle text, p_name text default null, p_guest uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare h text := lower(btrim(p_handle)); e text; dn text; g public.group_guests;
begin
  if not public.is_group_owner(p_group) then raise exception 'Only the group owner can invite people.'; end if;
  if exists (select 1 from public.groups where id = p_group and personal) then
    raise exception 'Your Personal group is private. Add people by name instead.';
  end if;
  if position('@' in ltrim(h, '@')) > 0 then
    e := h;
    if e !~ '^\S+@\S+\.\S+$' then raise exception 'Enter a valid email address or username.'; end if;
  else
    h := ltrim(h, '@');
    select email, name into e, dn from public.profiles where username = h;
    if e is null then raise exception 'No one has that username.'; end if;
  end if;
  if exists (select 1 from public.group_members m join public.profiles p on p.id = m.user_id where m.group_id = p_group and p.email = e) then
    raise exception 'That person is already in this group.';
  end if;
  begin
    if p_guest is not null then
      select * into g from public.group_guests where id = p_guest and group_id = p_group;
      if not found then raise exception 'That person is not in this group.'; end if;
      if g.email is not null then raise exception '% already has an invite.', g.name; end if;
      update public.group_guests set email = e where id = g.id;
      perform set_config('app.attach_guest', '1', true);
      insert into public.group_invites (group_id, email) values (p_group, e);
      perform set_config('app.attach_guest', '', true);
    else
      insert into public.group_invites (group_id, email, guest_name) values (p_group, e, coalesce(nullif(btrim(p_name), ''), dn));
    end if;
  exception when unique_violation then
    perform set_config('app.attach_guest', '', true);
    raise exception 'That person already has a pending invite.';
  end;
end $$;

-- One private group per user, created on first use.
create function public.ensure_personal_group() returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); gid uuid;
begin
  if uid is null then raise exception 'Sign in first.'; end if;
  select id into gid from public.groups where owner_id = uid and personal;
  if gid is null then
    insert into public.groups (owner_id, name, personal) values (uid, 'Personal', true) returning id into gid;
  end if;
  return gid;
end $$;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('add_guest', 'rename_guest', 'remove_guest', 'merge_guest', 'invite_person', 'ensure_personal_group')
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
