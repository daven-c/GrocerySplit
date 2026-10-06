-- Each member can pin groups for themselves (their own row only, and only that one column).
alter table public.group_members add column pinned boolean not null default false;
revoke update on public.group_members from authenticated;
grant update (pinned) on public.group_members to authenticated;
create policy "pin own membership" on public.group_members for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
