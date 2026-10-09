-- Let a signed-in person delete their own account.
--  * Groups you own that other members are in must be deleted first, so nobody loses their expenses by surprise.
--  * Groups you own with nobody else in them, and your Personal section, are deleted with you.
--  * In other people's groups you are removed as a member. Expenses you added stay (their author becomes blank), but
--    from then on they are ignored in balances, exactly as if you had left the group.
--  * Transfers you recorded in other people's groups are kept, credited to that group's owner (the column would
--    otherwise cascade-delete them and change everyone's balances).
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); shared text;
begin
  if uid is null then raise exception 'Sign in first.'; end if;

  select string_agg(g.name, ', ' order by g.name) into shared
  from public.groups g
  where g.owner_id = uid and not g.personal
    and exists (select 1 from public.group_members m where m.group_id = g.id and m.user_id <> uid);
  if shared is not null then
    raise exception 'You own groups that other people are in (%). Delete those groups first, so nobody loses their expenses.', shared;
  end if;

  perform set_config('app.claiming', '1', true); -- the transfer log refuses a reassignment otherwise
  update public.settlements s set created_by = g.owner_id
  from public.groups g
  where s.group_id = g.id and s.created_by = uid and g.owner_id <> uid;
  perform set_config('app.claiming', '', true);

  delete from auth.users where id = uid; -- profile, memberships and the groups you own go with it
end $$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
