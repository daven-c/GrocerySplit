-- Invited people can be used in expenses before they join.
-- Inviting an email creates a "guest" in the group: a member-like row with its own id that can be a payer, share an
-- expense or be part of a transfer. When the person accepts, every use of the guest id is moved to their real user id.

create table public.group_guests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  email text not null check (email = lower(btrim(email))),
  name text not null check (length(btrim(name)) between 1 and 60),
  invited_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (group_id, email)
);
create index group_guests_invited_by_idx on public.group_guests(invited_by);

alter table public.group_guests enable row level security;
create policy "members see guests" on public.group_guests for select to authenticated
  using (public.is_group_member(group_id));
-- no write policies: guests are created and removed only by the triggers and functions below

alter table public.group_invites add column guest_name text
  check (guest_name is null or length(btrim(guest_name)) between 1 and 60);

-- Payers and transfer parties may now be guests, so these can no longer point only at profiles.
-- Policies (is_member_uid) check them on every write instead.
alter table public.sessions drop constraint sessions_paid_by_fkey;
alter table public.settlements drop constraint settlements_from_user_fkey;
alter table public.settlements drop constraint settlements_to_user_fkey;

create or replace function public.is_member_uid(gid uuid, uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members where group_id = gid and user_id = uid)
      or exists (select 1 from public.group_guests where group_id = gid and id = uid)
$$;

-- The expense validator accepts guests as people in the split.
create or replace function public.validate_expense() returns trigger
language plpgsql set search_path = '' as $$
declare
  k text;
  v numeric;
  n int := 0;
  total numeric := 0;
begin
  if tg_op = 'UPDATE' then
    if new.group_id is distinct from old.group_id then
      raise exception 'A record cannot move to another group';
    end if;
    if new.amount is not distinct from old.amount
       and new.split_method is not distinct from old.split_method
       and new.split_data is not distinct from old.split_data
       and new.kind is not distinct from old.kind then
      return new;
    end if;
  end if;

  if new.kind <> 'expense' then
    return new;
  end if;

  if jsonb_typeof(new.split_data) is distinct from 'object' then
    raise exception 'split_data must be an object of member id to number';
  end if;

  for k, v in select key, (value #>> '{}')::numeric from jsonb_each(new.split_data) loop
    n := n + 1;
    if v < 0 then
      raise exception 'Split values cannot be negative';
    end if;
    if not exists (select 1 from public.group_members m where m.group_id = new.group_id and m.user_id::text = k)
       and not exists (select 1 from public.group_guests g where g.group_id = new.group_id and g.id::text = k) then
      raise exception 'The split includes someone who is not in the group';
    end if;
    total := total + v;
  end loop;

  if n = 0 then
    raise exception 'Choose at least one person to share the expense';
  end if;
  if new.split_method = 'exact' and round(total * 100) <> round(new.amount * 100) then
    raise exception 'Exact amounts must add up to the total';
  elsif new.split_method = 'percent' and abs(total - 100) > 0.005 then
    raise exception 'Percentages must add up to 100';
  elsif new.split_method = 'shares' and total <= 0 then
    raise exception 'Give at least one person a share';
  end if;
  return new;
end $$;

-- Is this guest part of any expense, receipt item or transfer?
create function public.guest_in_use(gid uuid, guest uuid, gname text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.sessions s where s.group_id = gid and (s.paid_by = guest or (s.kind = 'expense' and s.split_data ? guest::text)))
      or exists (select 1 from public.items i join public.sessions s on s.id = i.session_id where s.group_id = gid and gname = any(i.assigned_users))
      or exists (select 1 from public.settlements t where t.group_id = gid and (t.from_user = guest or t.to_user = guest))
$$;
revoke execute on function public.guest_in_use(uuid, uuid, text) from public, anon, authenticated;

-- Remove a guest if nothing uses it (also tidies their name out of receipts); returns whether it is gone.
create function public.drop_guest(gid uuid, guest_email text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare g public.group_guests;
begin
  select * into g from public.group_guests where group_id = gid and email = guest_email;
  if not found then return true; end if;
  if public.guest_in_use(gid, g.id, g.name) then return false; end if;
  update public.sessions set participants = array_remove(participants, g.name) where group_id = gid;
  delete from public.group_guests where id = g.id;
  return true;
end $$;
revoke execute on function public.drop_guest(uuid, text) from public, anon, authenticated;

-- Inviting someone makes them usable straight away. Names stay unique within the group (receipts match by name).
create function public.invite_creates_guest() returns trigger
language plpgsql security definer set search_path = '' as $$
declare base text; candidate text; n int := 1;
begin
  base := coalesce(nullif(btrim(new.guest_name), ''), split_part(new.email, '@', 1));
  candidate := base;
  while exists (select 1 from public.group_members m join public.profiles p on p.id = m.user_id where m.group_id = new.group_id and p.name = candidate)
     or exists (select 1 from public.group_guests g where g.group_id = new.group_id and g.name = candidate) loop
    n := n + 1;
    candidate := base || ' ' || n;
  end loop;
  insert into public.group_guests (group_id, email, name, invited_by)
  values (new.group_id, new.email, candidate, new.invited_by)
  on conflict (group_id, email) do nothing;
  return new;
end $$;
revoke execute on function public.invite_creates_guest() from public, anon, authenticated;
create trigger group_invites_guest after insert on public.group_invites
  for each row execute function public.invite_creates_guest();

-- Cancelling an invite removes the guest, unless they are already in expenses (that would orphan them).
create function public.invite_cancel_guest() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'pending' and exists (select 1 from public.groups where id = old.group_id) then
    if not public.drop_guest(old.group_id, old.email) then
      raise exception 'That person is already in expenses, so the invite can''t be cancelled. Remove them from those first.';
    end if;
  end if;
  return old;
end $$;
revoke execute on function public.invite_cancel_guest() from public, anon, authenticated;
create trigger group_invites_cancel_guest before delete on public.group_invites
  for each row execute function public.invite_cancel_guest();

-- Accepting claims the guest: everything that used the guest id (and name) now points at the real person.
create or replace function public.respond_to_invite(invite_id uuid, accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  inv public.group_invites;
  g public.group_guests;
  uid uuid := (select auth.uid());
  pname text;
begin
  select * into inv from public.group_invites
  where id = invite_id and status = 'pending' and email = lower((select auth.jwt()) ->> 'email')
  for update;
  if not found then raise exception 'Invite not found or already answered'; end if;
  update public.group_invites
    set status = case when accept then 'accepted' else 'declined' end, responded_at = now()
    where id = invite_id;

  if not accept then
    perform public.drop_guest(inv.group_id, inv.email); -- stays if already used in expenses
    return;
  end if;

  insert into public.group_members (group_id, user_id) values (inv.group_id, uid) on conflict do nothing;

  select * into g from public.group_guests where group_id = inv.group_id and email = inv.email;
  if found then
    select name into pname from public.profiles where id = uid;
    perform set_config('app.claiming', '1', true); -- keeps the transfer ledger from logging this as an edit
    update public.sessions set paid_by = uid where group_id = inv.group_id and paid_by = g.id;
    update public.sessions
      set split_data = (split_data - g.id::text) || jsonb_build_object(uid::text, split_data -> g.id::text)
      where group_id = inv.group_id and kind = 'expense' and split_data ? g.id::text;
    update public.settlements set from_user = uid where group_id = inv.group_id and from_user = g.id;
    update public.settlements set to_user = uid where group_id = inv.group_id and to_user = g.id;
    update public.settlement_log set from_user = uid where group_id = inv.group_id and from_user = g.id;
    update public.settlement_log set to_user = uid where group_id = inv.group_id and to_user = g.id;
    update public.settlement_log set prev_from_user = uid where group_id = inv.group_id and prev_from_user = g.id;
    update public.settlement_log set prev_to_user = uid where group_id = inv.group_id and prev_to_user = g.id;
    if pname is not null and pname <> g.name then
      update public.sessions set participants = array_replace(participants, g.name, pname) where group_id = inv.group_id;
      update public.items set assigned_users = array_replace(assigned_users, g.name, pname)
        where session_id in (select id from public.sessions where group_id = inv.group_id);
    end if;
    delete from public.group_guests where id = g.id;
    perform set_config('app.claiming', '', true);
  end if;
end $$;

-- The transfer ledger ignores the id swap above.
create or replace function public.log_settlement_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('app.claiming', true) = '1' then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' then
    if new.group_id <> old.group_id or new.created_by <> old.created_by then
      raise exception 'A transfer cannot be moved to another group or reassigned';
    end if;
    if new.from_user = old.from_user and new.to_user = old.to_user and new.amount = old.amount then
      return new;
    end if;
    insert into public.settlement_log(group_id, settlement_id, action, from_user, to_user, amount, prev_from_user, prev_to_user, prev_amount)
    values (new.group_id, new.id, 'edited', new.from_user, new.to_user, new.amount, old.from_user, old.to_user, old.amount);
    return new;
  elsif tg_op = 'INSERT' then
    insert into public.settlement_log(group_id, settlement_id, action, actor, from_user, to_user, amount)
    values (new.group_id, new.id, 'created', new.created_by, new.from_user, new.to_user, new.amount);
    return new;
  else
    if exists (select 1 from public.groups where id = old.group_id) then
      insert into public.settlement_log(group_id, settlement_id, action, from_user, to_user, amount)
      values (old.group_id, old.id, 'deleted', old.from_user, old.to_user, old.amount);
    end if;
    return old;
  end if;
end $$;

-- Invites that were already pending get their guest too.
insert into public.group_guests (group_id, email, name, invited_by)
select i.group_id, i.email, split_part(i.email, '@', 1), i.invited_by
from public.group_invites i where i.status = 'pending'
on conflict do nothing;
