-- Database hardening from the site review.
--  * is_member_uid(group, user) could be called through the API by any signed-in person to ask whether any user is in any
--    group. It is only used (inside policies and triggers) by people who are in the group already, so it now answers
--    only about groups the caller belongs to.
--  * Two foreign keys added recently had no index.

create or replace function public.is_member_uid(gid uuid, uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (exists (select 1 from public.group_members where group_id = gid and user_id = uid)
          or exists (select 1 from public.group_guests where group_id = gid and id = uid))
     and public.is_group_member(gid)
$$;

create index if not exists group_guests_linked_user_idx on public.group_guests (linked_user);
create index if not exists session_photos_created_by_idx on public.session_photos (created_by);
