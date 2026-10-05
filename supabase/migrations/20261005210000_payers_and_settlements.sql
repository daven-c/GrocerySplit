-- Who paid for a receipt, and recorded payments between members (for balances across friends).
create function public.is_member_uid(gid uuid, uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members where group_id = gid and user_id = uid)
$$;
revoke execute on function public.is_member_uid(uuid, uuid) from public, anon;
grant execute on function public.is_member_uid(uuid, uuid) to authenticated;

alter table public.sessions add column paid_by uuid references public.profiles(id) on delete set null;
update public.sessions set paid_by = user_id where paid_by is null and user_id is not null;

-- New receipts default to "paid by whoever added it".
create function public.default_paid_by() returns trigger
language plpgsql as $$
begin
  new.paid_by := coalesce(new.paid_by, new.user_id);
  return new;
end $$;
create trigger sessions_default_paid_by before insert on public.sessions
for each row execute function public.default_paid_by();

drop policy "members add receipts" on public.sessions;
drop policy "members edit receipts" on public.sessions;
create policy "members add receipts" on public.sessions for insert to authenticated
  with check (public.is_group_member(group_id) and user_id = (select auth.uid())
    and (paid_by is null or public.is_member_uid(group_id, paid_by)));
create policy "members edit receipts" on public.sessions for update to authenticated
  using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id) and (paid_by is null or public.is_member_uid(group_id, paid_by)));

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  from_user uuid not null references public.profiles(id) on delete cascade,
  to_user uuid not null references public.profiles(id) on delete cascade,
  amount numeric(10,2) not null check (amount > 0),
  created_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (from_user <> to_user)
);
create index settlements_group_idx on public.settlements(group_id);

alter table public.settlements enable row level security;
create policy "members see settlements" on public.settlements for select to authenticated
  using (public.is_group_member(group_id));
create policy "party records settlement" on public.settlements for insert to authenticated
  with check (created_by = (select auth.uid())
    and (from_user = (select auth.uid()) or to_user = (select auth.uid()))
    and public.is_member_uid(group_id, from_user) and public.is_member_uid(group_id, to_user));
create policy "creator undoes settlement" on public.settlements for delete to authenticated
  using (created_by = (select auth.uid()));
