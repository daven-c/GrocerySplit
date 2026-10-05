-- Any member of a group may record a payback between two members of that group (not only ones involving
-- themselves). Outsiders still can't, both people must be members, and only the recorder can undo it.
alter policy "party records settlement" on public.settlements
  with check (
    created_by = (select auth.uid())
    and public.is_group_member(group_id)
    and public.is_member_uid(group_id, from_user)
    and public.is_member_uid(group_id, to_user)
  );
alter policy "party records settlement" on public.settlements rename to "members record settlements";
