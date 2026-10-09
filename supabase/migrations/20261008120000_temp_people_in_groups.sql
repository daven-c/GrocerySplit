-- Let owners add a temporary, name-only person to any group (e.g. a friend who has not signed up yet),
-- and rename them. Invites stay username-only.

create or replace function public.add_guest(p_group uuid, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare n text := btrim(p_name); gid uuid;
begin
  if not public.is_group_owner(p_group) then raise exception 'Only the group owner can add people.'; end if;
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
  if length(n) < 1 or length(n) > 60 then raise exception 'Names are 1 to 60 characters.'; end if;
  if public._name_taken(g.group_id, n, g.id) then raise exception 'Someone in this group already has that name.'; end if;
  update public.sessions set participants = public._dedupe(array_replace(participants, g.name, n)) where group_id = g.group_id;
  update public.items set assigned_users = public._dedupe(array_replace(assigned_users, g.name, n))
    where session_id in (select id from public.sessions where group_id = g.group_id);
  update public.group_guests set name = n where id = g.id;
end $$;
