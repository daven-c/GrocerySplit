-- Receipts name people by id, not by display name. `participants` and `items.assigned_users` keep the same text[]
-- columns but now hold person ids (a member's user id, or a temporary person's guest id as text), so two people with
-- the same display name stay apart. When a temporary person becomes a real account (or two people are remapped),
-- their id is swapped in place, and renaming a person no longer touches receipts at all.

-- 1. Convert existing receipts: a name becomes the id of the one person in that group who has it. Names that match
--    nobody, or more than one person, are left as they were (they simply stop counting, as before).
with people as (
  select s.id as sid, g.id as gid, p.id::text as pid, p.name
  from public.sessions s
  join public.groups g on g.id = s.group_id
  join public.group_members gm on gm.group_id = g.id
  join public.profiles p on p.id = gm.user_id
  union all
  select s.id, s.group_id, gg.id::text, gg.name
  from public.sessions s join public.group_guests gg on gg.group_id = s.group_id
), unique_people as (
  select sid, name, min(pid) as pid from people group by sid, name having count(*) = 1
)
update public.sessions s set participants = (
  select coalesce(array_agg(coalesce(u.pid, n) order by ord), '{}')
  from unnest(s.participants) with ordinality as t(n, ord)
  left join unique_people u on u.sid = s.id and u.name = t.n
)
where s.kind = 'receipt' and cardinality(s.participants) > 0;

with people as (
  select s.id as sid, p.id::text as pid, p.name
  from public.sessions s join public.group_members gm on gm.group_id = s.group_id join public.profiles p on p.id = gm.user_id
  union all
  select s.id, gg.id::text, gg.name
  from public.sessions s join public.group_guests gg on gg.group_id = s.group_id
), unique_people as (
  select sid, name, min(pid) as pid from people group by sid, name having count(*) = 1
)
update public.items i set assigned_users = (
  select coalesce(array_agg(coalesce(u.pid, n) order by ord), '{}')
  from unnest(i.assigned_users) with ordinality as t(n, ord)
  left join unique_people u on u.sid = i.session_id and u.name = t.n
)
where cardinality(i.assigned_users) > 0;

-- 2. Swapping one person for another (a temporary person claimed by an account, or a remap) replaces their id.
create or replace function public._remap_person(gid uuid, from_id uuid, from_name text, to_id uuid, to_name text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.claiming', '1', true);
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
  update public.sessions set participants = public._dedupe(array_replace(participants, from_id::text, to_id::text)) where group_id = gid;
  update public.items set assigned_users = public._dedupe(array_replace(assigned_users, from_id::text, to_id::text))
    where session_id in (select id from public.sessions where group_id = gid);
  perform set_config('app.claiming', '', true);
end $$;

-- 3. Is a temporary person part of any expense, receipt item or transfer? (items are matched by id now)
create or replace function public.guest_in_use(gid uuid, guest uuid, gname text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.sessions s where s.group_id = gid and (s.paid_by = guest or (s.kind = 'expense' and s.split_data ? guest::text)))
      or exists (select 1 from public.items i join public.sessions s on s.id = i.session_id where s.group_id = gid and guest::text = any(i.assigned_users))
      or exists (select 1 from public.settlements t where t.group_id = gid and (t.from_user = guest or t.to_user = guest))
$$;

create or replace function public.drop_guest(gid uuid, guest_email text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare g public.group_guests;
begin
  select * into g from public.group_guests where group_id = gid and email = guest_email;
  if not found then return true; end if;
  if public.guest_in_use(gid, g.id, g.name) then return false; end if;
  update public.sessions set participants = array_remove(participants, g.id::text) where group_id = gid;
  delete from public.group_guests where id = g.id;
  return true;
end $$;

create or replace function public.remove_guest(p_guest uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare g public.group_guests;
begin
  select * into g from public.group_guests where id = p_guest;
  if not found or not public.is_group_owner(g.group_id) then raise exception 'Only the group owner can remove people.'; end if;
  if public.guest_in_use(g.group_id, g.id, g.name) then
    raise exception '% is already in expenses. Delete those first.', g.name;
  end if;
  update public.sessions set participants = array_remove(participants, g.id::text) where group_id = g.group_id;
  delete from public.group_invites where group_id = g.group_id and email = g.email and status = 'pending';
  delete from public.group_guests where id = g.id;
end $$;

-- 4. Renaming a person changes only their name: receipts point at the id.
create or replace function public.rename_guest(p_guest uuid, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare g public.group_guests; n text := btrim(p_name);
begin
  select * into g from public.group_guests where id = p_guest;
  if not found or not public.is_group_owner(g.group_id) then raise exception 'Only the group owner can rename people.'; end if;
  if length(n) < 1 or length(n) > 60 then raise exception 'Names are 1 to 60 characters.'; end if;
  if public._name_taken(g.group_id, n, g.id) then raise exception 'Someone in this group already has that name.'; end if;
  update public.group_guests set name = n where id = g.id;
end $$;
