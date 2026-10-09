-- A name in your Personal section can point at a real account (by username) without inviting anyone:
-- nobody is notified and nothing is shared. It only lets the People page show what is between you in Personal,
-- separately from the shared-group balances.

alter table public.group_guests
  add column linked_user uuid references public.profiles(id) on delete set null,
  add column linked_username text;
create unique index group_guests_linked_uq on public.group_guests (group_id, linked_user) where linked_user is not null;
grant select (linked_user, linked_username) on public.group_guests to authenticated;

-- Add someone by name, or by username (the name then defaults to theirs). Usernames only link in Personal.
drop function if exists public.add_guest(uuid, text);
create function public.add_guest(p_group uuid, p_name text, p_username text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare n text := btrim(coalesce(p_name, '')); h text := ltrim(lower(btrim(coalesce(p_username, ''))), '@');
        uid uuid; uname text; pn text; gid uuid;
begin
  if not public.is_group_owner(p_group) then raise exception 'Only the group owner can add people.'; end if;
  if h <> '' then
    if not exists (select 1 from public.groups where id = p_group and personal) then
      raise exception 'People are invited by username from the Members tab.';
    end if;
    select id, username, name into uid, uname, pn from public.profiles where username = h;
    if uid is null then raise exception 'No one has that username.'; end if;
    if uid = (select auth.uid()) then raise exception 'That is you.'; end if;
    if n = '' then n := pn; end if;
  end if;
  if length(n) < 1 or length(n) > 60 then raise exception 'Names are 1 to 60 characters.'; end if;
  if public._name_taken(p_group, n) then raise exception 'Someone in this group already has that name.'; end if;
  begin
    insert into public.group_guests (group_id, name, linked_user, linked_username) values (p_group, n, uid, uname) returning id into gid;
  exception when unique_violation then
    raise exception 'That account is already linked to someone here.';
  end;
  return gid;
end $$;

-- Link (or, with an empty username, unlink) a name that is already in Personal.
create function public.link_personal_person(p_guest uuid, p_username text) returns void
language plpgsql security definer set search_path = '' as $$
declare g public.group_guests; h text := ltrim(lower(btrim(coalesce(p_username, ''))), '@'); uid uuid; uname text;
begin
  select * into g from public.group_guests where id = p_guest;
  if not found or not public.is_group_owner(g.group_id) then raise exception 'Only the owner can change this.'; end if;
  if not exists (select 1 from public.groups where id = g.group_id and personal) then
    raise exception 'Only people in your Personal section can be linked this way.';
  end if;
  if h = '' then
    update public.group_guests set linked_user = null, linked_username = null where id = g.id;
    return;
  end if;
  select id, username into uid, uname from public.profiles where username = h;
  if uid is null then raise exception 'No one has that username.'; end if;
  if uid = (select auth.uid()) then raise exception 'That is you.'; end if;
  begin
    update public.group_guests set linked_user = uid, linked_username = uname where id = g.id;
  exception when unique_violation then
    raise exception 'That account is already linked to someone here.';
  end;
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('add_guest', 'link_personal_person')
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
