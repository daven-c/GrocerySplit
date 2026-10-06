-- Any member of a group can edit or delete any payback in it, and every change is written to a ledger.
-- The ledger is filled by a trigger (SECURITY DEFINER), so clients can read it but never write or alter it.

create policy "members edit settlements" on public.settlements for update to authenticated
  using (public.is_group_member(group_id))
  with check (
    public.is_group_member(group_id)
    and public.is_member_uid(group_id, from_user)
    and public.is_member_uid(group_id, to_user)
  );

drop policy "creator undoes settlement" on public.settlements;
create policy "members delete settlements" on public.settlements for delete to authenticated
  using (public.is_group_member(group_id));

create table public.settlement_log (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  settlement_id uuid not null,
  action text not null check (action in ('created', 'edited', 'deleted')),
  actor uuid default auth.uid(),
  from_user uuid not null,
  to_user uuid not null,
  amount numeric(10,2) not null,
  prev_from_user uuid,
  prev_to_user uuid,
  prev_amount numeric(10,2),
  created_at timestamptz not null default now()
);
create index settlement_log_group_idx on public.settlement_log(group_id, created_at desc);
create index settlement_log_actor_idx on public.settlement_log(actor);

alter table public.settlement_log enable row level security;
create policy "members see settlement log" on public.settlement_log for select to authenticated
  using (public.is_group_member(group_id));
-- no insert/update/delete policies: only the trigger below writes here

create function public.log_settlement_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.group_id <> old.group_id or new.created_by <> old.created_by then
      raise exception 'A payback cannot be moved to another group or reassigned';
    end if;
    if new.from_user = old.from_user and new.to_user = old.to_user and new.amount = old.amount then
      return new; -- nothing changed
    end if;
    insert into public.settlement_log(group_id, settlement_id, action, from_user, to_user, amount, prev_from_user, prev_to_user, prev_amount)
    values (new.group_id, new.id, 'edited', new.from_user, new.to_user, new.amount, old.from_user, old.to_user, old.amount);
    return new;
  elsif tg_op = 'INSERT' then
    insert into public.settlement_log(group_id, settlement_id, action, actor, from_user, to_user, amount)
    values (new.group_id, new.id, 'created', new.created_by, new.from_user, new.to_user, new.amount);
    return new;
  else
    -- when a whole group is deleted its paybacks go with it; there is nothing left to log against
    if exists (select 1 from public.groups where id = old.group_id) then
      insert into public.settlement_log(group_id, settlement_id, action, from_user, to_user, amount)
      values (old.group_id, old.id, 'deleted', old.from_user, old.to_user, old.amount);
    end if;
    return old;
  end if;
end $$;
revoke execute on function public.log_settlement_change() from public, anon, authenticated;

create trigger settlements_log after insert or update or delete on public.settlements
  for each row execute function public.log_settlement_change();
