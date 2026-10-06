-- Simplify who can be in a group:
--   * Shared groups: invite by @username only. While the invite is pending the person can already be used in
--     expenses; everything moves to their account on accept. Emails are never shown to the group.
--   * Name-only people (no account) exist only in the owner's private Personal group.

drop function if exists public.invite_person(uuid, text, text, uuid);

create function public.invite_person(p_group uuid, p_username text) returns void
language plpgsql security definer set search_path = '' as $$
declare h text := ltrim(lower(btrim(p_username)), '@'); e text; dn text;
begin
  if not public.is_group_owner(p_group) then raise exception 'Only the group owner can invite people.'; end if;
  if exists (select 1 from public.groups where id = p_group and personal) then
    raise exception 'Your Personal section is private. Add people by name instead.';
  end if;
  if h !~ '^[a-z0-9_]{3,20}$' then raise exception 'Enter a username: 3 to 20 letters, numbers or underscores.'; end if;
  select email, name into e, dn from public.profiles where username = h;
  if e is null then raise exception 'No one has that username.'; end if;
  if exists (select 1 from public.group_members m join public.profiles p on p.id = m.user_id where m.group_id = p_group and p.email = e) then
    raise exception 'That person is already in this group.';
  end if;
  begin
    insert into public.group_invites (group_id, email, guest_name) values (p_group, e, dn);
  exception when unique_violation then
    raise exception 'That person already has a pending invite.';
  end;
end $$;

-- By name only: just in the Personal section.
create or replace function public.add_guest(p_group uuid, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare n text := btrim(p_name); gid uuid;
begin
  if not public.is_group_owner(p_group) then raise exception 'Only the group owner can add people.'; end if;
  if not exists (select 1 from public.groups where id = p_group and personal) then
    raise exception 'People are added by username. Adding by name is only for your Personal section.';
  end if;
  if length(n) < 1 or length(n) > 60 then raise exception 'Names are 1 to 60 characters.'; end if;
  if public._name_taken(p_group, n) then raise exception 'Someone in this group already has that name.'; end if;
  insert into public.group_guests (group_id, name) values (p_group, n) returning id into gid;
  return gid;
end $$;

create or replace function public.rename_guest(p_guest uuid, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare g public.group_guests; n text := btrim(p_name);
begin
  select * into g from public.group_guests where id = p_guest;
  if not found or not public.is_group_owner(g.group_id) then raise exception 'Only the group owner can rename people.'; end if;
  if not exists (select 1 from public.groups where id = g.group_id and personal) then
    raise exception 'Only people in your Personal section can be renamed.';
  end if;
  if length(n) < 1 or length(n) > 60 then raise exception 'Names are 1 to 60 characters.'; end if;
  if public._name_taken(g.group_id, n, g.id) then raise exception 'Someone in this group already has that name.'; end if;
  update public.sessions set participants = public._dedupe(array_replace(participants, g.name, n)) where group_id = g.group_id;
  update public.items set assigned_users = public._dedupe(array_replace(assigned_users, g.name, n))
    where session_id in (select id from public.sessions where group_id = g.group_id);
  update public.group_guests set name = n where id = g.id;
end $$;

-- Pending invites without the email (usernames keep emails private), and cancelling one.
create function public.group_pending_invites(p_group uuid) returns table (id uuid, group_id uuid, name text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select i.id, i.group_id, coalesce(g.name, i.guest_name, 'Invited person'), i.created_at
  from public.group_invites i
  left join public.group_guests g on g.group_id = i.group_id and g.email = i.email
  where i.group_id = p_group and i.status = 'pending' and public.is_group_owner(p_group)
  order by i.created_at
$$;

create function public.revoke_invite(p_invite uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare gid uuid;
begin
  select group_id into gid from public.group_invites where id = p_invite;
  if gid is null or not public.is_group_owner(gid) then raise exception 'Only the group owner can cancel invites.'; end if;
  delete from public.group_invites where id = p_invite; -- the trigger refuses if they are already in expenses
end $$;

-- Invites and guest emails are no longer readable by clients directly.
revoke all on public.group_invites from authenticated;
revoke select on public.group_guests from authenticated;
grant select (id, group_id, name, invited_by, created_at) on public.group_guests to authenticated;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('invite_person', 'group_pending_invites', 'revoke_invite')
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
