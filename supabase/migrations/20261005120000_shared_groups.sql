-- Shared groups with receipts inside them. Replaces the earlier local-only `groups` table
-- (it held no data). Existing receipts are moved into a per-user "My Receipts" group. Receipts (sessions) now belong to a group and are visible /
-- editable by every member of that group.
drop table if exists public.groups;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null
);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name, email)
  values (new.id,
          coalesce(nullif(btrim(new.raw_user_meta_data->>'name'), ''), split_part(new.email, '@', 1)),
          lower(new.email))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

insert into public.profiles (id, name, email)
select id, coalesce(nullif(btrim(raw_user_meta_data->>'name'), ''), split_part(email, '@', 1)), lower(email)
from auth.users on conflict (id) do nothing;

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members(user_id);

create table public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  invited_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and position('@' in email) > 1),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);
create unique index group_invites_pending_uq on public.group_invites(group_id, email) where status = 'pending';
create index group_invites_email_idx on public.group_invites(email);

-- Receipts belong to a group. user_id becomes "added by" and survives that user leaving.
alter table public.sessions add column group_id uuid references public.groups(id) on delete cascade;
create index sessions_group_idx on public.sessions(group_id);
alter table public.sessions alter column user_id drop not null;
alter table public.sessions drop constraint sessions_user_id_fkey,
  add constraint sessions_user_id_fkey foreign key (user_id) references auth.users(id) on delete set null;
alter table public.items alter column user_id drop not null;
alter table public.items drop constraint items_user_id_fkey,
  add constraint items_user_id_fkey foreign key (user_id) references auth.users(id) on delete set null;

-- Helpers are SECURITY DEFINER so RLS policies can consult membership without recursing.
create function public.is_group_member(gid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members where group_id = gid and user_id = (select auth.uid()))
$$;

create function public.is_group_owner(gid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.groups where id = gid and owner_id = (select auth.uid()))
$$;

create function public.is_session_member(sid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.sessions s join public.group_members m on m.group_id = s.group_id
    where s.id = sid and m.user_id = (select auth.uid()))
$$;

create function public.shares_group_with(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.group_members a join public.group_members b on a.group_id = b.group_id
    where a.user_id = (select auth.uid()) and b.user_id = uid)
$$;

-- The creator automatically becomes the owner-member.
create function public.add_owner_as_member() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.group_members (group_id, user_id, role) values (new.id, new.owner_id, 'owner');
  return new;
end $$;
create trigger on_group_created after insert on public.groups
for each row execute function public.add_owner_as_member();

-- Keep pre-existing receipts: give each user who has any a "My Receipts" group they own.
do $$
declare r record; gid uuid;
begin
  for r in select distinct user_id from public.sessions where user_id is not null loop
    insert into public.groups (owner_id, name) values (r.user_id, 'My Receipts') returning id into gid;
    update public.sessions set group_id = gid where user_id = r.user_id;
  end loop;
end $$;
alter table public.sessions alter column group_id set not null;

-- Invitees are matched by the email on their login token (they cannot read groups directly).
create function public.my_invites() returns table (
  id uuid, group_id uuid, group_name text, inviter_name text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select i.id, i.group_id, g.name, p.name, i.created_at
  from public.group_invites i
  join public.groups g on g.id = i.group_id
  join public.profiles p on p.id = i.invited_by
  where i.status = 'pending' and i.email = lower((select auth.jwt()) ->> 'email')
  order by i.created_at desc
$$;

create function public.respond_to_invite(invite_id uuid, accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare inv public.group_invites;
begin
  select * into inv from public.group_invites
  where id = invite_id and status = 'pending' and email = lower((select auth.jwt()) ->> 'email')
  for update;
  if not found then raise exception 'Invite not found or already answered'; end if;
  update public.group_invites
    set status = case when accept then 'accepted' else 'declined' end, responded_at = now()
    where id = invite_id;
  if accept then
    insert into public.group_members (group_id, user_id) values (inv.group_id, (select auth.uid()))
    on conflict do nothing;
  end if;
end $$;

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invites enable row level security;

create policy "see self and group mates" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_group_with(id));
create policy "update own profile" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "members see group" on public.groups for select to authenticated
  using (public.is_group_member(id) or owner_id = (select auth.uid()));
create policy "create own group" on public.groups for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "owner renames group" on public.groups for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "owner deletes group" on public.groups for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy "members see members" on public.group_members for select to authenticated
  using (public.is_group_member(group_id));
create policy "leave or get removed" on public.group_members for delete to authenticated
  using (role = 'member' and (user_id = (select auth.uid()) or public.is_group_owner(group_id)));

create policy "owner sees invites" on public.group_invites for select to authenticated
  using (public.is_group_owner(group_id));
create policy "owner invites" on public.group_invites for insert to authenticated
  with check (public.is_group_owner(group_id) and invited_by = (select auth.uid()) and status = 'pending');
create policy "owner revokes invite" on public.group_invites for delete to authenticated
  using (public.is_group_owner(group_id));

-- Receipts and items: any member of the receipt's group.
drop policy "own sessions" on public.sessions;
drop policy "own items" on public.items;

create policy "members read receipts" on public.sessions for select to authenticated
  using (public.is_group_member(group_id));
create policy "members add receipts" on public.sessions for insert to authenticated
  with check (public.is_group_member(group_id) and user_id = (select auth.uid()));
create policy "members edit receipts" on public.sessions for update to authenticated
  using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));
create policy "members delete receipts" on public.sessions for delete to authenticated
  using (public.is_group_member(group_id));

create policy "members read items" on public.items for select to authenticated
  using (public.is_session_member(session_id));
create policy "members add items" on public.items for insert to authenticated
  with check (public.is_session_member(session_id) and user_id = (select auth.uid()));
create policy "members edit items" on public.items for update to authenticated
  using (public.is_session_member(session_id)) with check (public.is_session_member(session_id));
create policy "members delete items" on public.items for delete to authenticated
  using (public.is_session_member(session_id));

-- Signed-in users only (no anon); trigger functions are not callable at all.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.add_owner_as_member() from public, anon, authenticated;
revoke execute on function public.is_group_member(uuid) from public, anon;
revoke execute on function public.is_group_owner(uuid) from public, anon;
revoke execute on function public.is_session_member(uuid) from public, anon;
revoke execute on function public.shares_group_with(uuid) from public, anon;
revoke execute on function public.my_invites() from public, anon;
revoke execute on function public.respond_to_invite(uuid, boolean) from public, anon;
grant execute on function public.is_group_member(uuid), public.is_group_owner(uuid),
  public.is_session_member(uuid), public.shares_group_with(uuid), public.my_invites(),
  public.respond_to_invite(uuid, boolean) to authenticated;
