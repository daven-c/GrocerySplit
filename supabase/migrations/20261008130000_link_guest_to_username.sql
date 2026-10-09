-- Turn a temporary (name-only) person into a real account: invite a username and attach it to that person.
-- Their expenses move to the account when the invite is accepted. Plain invites still work (p_guest null).

drop function if exists public.invite_person(uuid, text);

create function public.invite_person(p_group uuid, p_username text, p_guest uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare h text := ltrim(lower(btrim(p_username)), '@'); e text; dn text; g public.group_guests;
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
    if p_guest is not null then
      select * into g from public.group_guests where id = p_guest and group_id = p_group;
      if not found then raise exception 'That person is not in this group.'; end if;
      if g.email is not null then raise exception '% already has an invite.', g.name; end if;
      update public.group_guests set email = e where id = g.id;
      perform set_config('app.attach_guest', '1', true);
      insert into public.group_invites (group_id, email) values (p_group, e);
      perform set_config('app.attach_guest', '', true);
    else
      insert into public.group_invites (group_id, email, guest_name) values (p_group, e, dn);
    end if;
  exception when unique_violation then
    perform set_config('app.attach_guest', '', true);
    raise exception 'That person already has a pending invite.';
  end;
end $$;

revoke execute on function public.invite_person(uuid, text, uuid) from public, anon;
grant execute on function public.invite_person(uuid, text, uuid) to authenticated;
