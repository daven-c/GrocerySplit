-- Activity ledger for expenses and receipts: every creation, edit and deletion, written by the database.
-- (Transfers already have settlement_log.) Drafts are invisible until they are saved, and an edit is one entry:
-- the app saves an edit explicitly (Save / Cancel), so there is one row per save rather than one per keystroke.

create table public.expense_log (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  session_id uuid not null,
  action text not null check (action in ('created', 'edited', 'deleted')),
  actor uuid default auth.uid(),
  kind text not null,
  name text not null,
  total numeric(12,2) not null default 0,
  -- [{ "field": "amount", "from": 20, "to": 25 }, ...] using raw values; the app words them
  changes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index expense_log_group_idx on public.expense_log(group_id, created_at desc);
create index expense_log_actor_idx on public.expense_log(actor);

alter table public.expense_log enable row level security;
create policy "members see expense log" on public.expense_log for select to authenticated
  using (public.is_group_member(group_id));
revoke all on public.expense_log from anon;
revoke insert, update, delete on public.expense_log from authenticated;

create function public._person_name(gid uuid, uid uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select name from public.profiles where id = uid),
                  (select name from public.group_guests where id = uid and group_id = gid), 'someone')
$$;
revoke execute on function public._person_name(uuid, uuid) from public, anon, authenticated;

create function public._record_total(sid uuid, kd text, amt numeric, tx numeric, tp numeric) returns numeric
language sql stable security definer set search_path = '' as $$
  select case when kd = 'expense' then coalesce(amt, 0)
              else coalesce((select sum(price) from public.items where session_id = sid), 0) + coalesce(tx, 0) + coalesce(tp, 0) end
$$;
revoke execute on function public._record_total(uuid, text, numeric, numeric, numeric) from public, anon, authenticated;

create function public.log_session_activity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare ch jsonb := '[]'::jsonb; diff jsonb; act text;
begin
  if tg_op = 'DELETE' then
    if old.draft or not exists (select 1 from public.groups where id = old.group_id) then return old; end if;
    insert into public.expense_log (group_id, session_id, action, kind, name, total)
    values (old.group_id, old.id, 'deleted', old.kind, old.name, public._record_total(old.id, old.kind, old.amount, old.tax, old.tip));
    return old;
  end if;

  if new.draft then return new; end if; -- a draft is nobody's business until it is saved

  if tg_op = 'INSERT' then
    insert into public.expense_log (group_id, session_id, action, kind, name, total)
    values (new.group_id, new.id, 'created', new.kind, new.name, public._record_total(new.id, new.kind, new.amount, new.tax, new.tip));
    return new;
  end if;
  if old.draft then -- saving a draft publishes it
    insert into public.expense_log (group_id, session_id, action, kind, name, total)
    values (new.group_id, new.id, 'created', new.kind, new.name, public._record_total(new.id, new.kind, new.amount, new.tax, new.tip));
    return new;
  end if;

  if new.name is distinct from old.name then ch := ch || jsonb_build_array(jsonb_build_object('field', 'name', 'from', old.name, 'to', new.name)); end if;
  if new.session_date is distinct from old.session_date then ch := ch || jsonb_build_array(jsonb_build_object('field', 'date', 'from', old.session_date, 'to', new.session_date)); end if;
  if new.category is distinct from old.category then ch := ch || jsonb_build_array(jsonb_build_object('field', 'category', 'from', old.category, 'to', new.category)); end if;
  if new.paid_by is distinct from old.paid_by then
    ch := ch || jsonb_build_array(jsonb_build_object('field', 'paid_by',
      'from', case when old.paid_by is null then null else public._person_name(old.group_id, old.paid_by) end,
      'to', case when new.paid_by is null then null else public._person_name(new.group_id, new.paid_by) end));
  end if;
  if new.kind is distinct from old.kind then ch := ch || jsonb_build_array(jsonb_build_object('field', 'kind', 'from', old.kind, 'to', new.kind)); end if;
  if new.kind = 'expense' and new.amount is distinct from old.amount then ch := ch || jsonb_build_array(jsonb_build_object('field', 'amount', 'from', old.amount, 'to', new.amount)); end if;
  if new.kind = 'expense' and (new.split_method is distinct from old.split_method or new.split_data is distinct from old.split_data) then
    ch := ch || jsonb_build_array(jsonb_build_object('field', 'split', 'from', old.split_method, 'to', new.split_method));
  end if;
  if new.tax is distinct from old.tax then ch := ch || jsonb_build_array(jsonb_build_object('field', 'tax', 'from', old.tax, 'to', new.tax)); end if;
  if new.tip is distinct from old.tip then ch := ch || jsonb_build_array(jsonb_build_object('field', 'tip', 'from', old.tip, 'to', new.tip)); end if;

  diff := nullif(current_setting('app.items_diff', true), '')::jsonb;
  if diff is not null and (jsonb_array_length(diff -> 'added') + jsonb_array_length(diff -> 'removed') + jsonb_array_length(diff -> 'changed')) > 0 then
    ch := ch || jsonb_build_array(jsonb_build_object('field', 'items', 'added', diff -> 'added', 'removed', diff -> 'removed', 'changed', diff -> 'changed'));
  end if;

  if jsonb_array_length(ch) > 0 then
    insert into public.expense_log (group_id, session_id, action, kind, name, total, changes)
    values (new.group_id, new.id, 'edited', new.kind, new.name, public._record_total(new.id, new.kind, new.amount, new.tax, new.tip), ch);
  end if;
  return new;
end $$;
revoke execute on function public.log_session_activity() from public, anon, authenticated;

create trigger sessions_log_activity before insert or update or delete on public.sessions
  for each row execute function public.log_session_activity();

-- Saving a receipt is one atomic step: the items and the details change together and are logged as one edit.
-- Runs as the caller, so the usual row-level security decides who may edit.
create function public.save_receipt(p_session uuid, p_patch jsonb, p_items jsonb) returns void
language plpgsql set search_path = '' as $$
declare
  s public.sessions; r jsonb; old_it public.items; rid uuid; nm text; pr numeric; asg text[];
  keep uuid[] := '{}'; added text[] := '{}'; removed text[] := '{}'; changed text[] := '{}';
begin
  select * into s from public.sessions where id = p_session for update;
  if not found then raise exception 'Receipt not found'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Items must be a list.'; end if;
  if jsonb_array_length(p_items) > 300 then raise exception 'A receipt can have up to 300 items.'; end if;

  for r in select * from jsonb_array_elements(p_items) loop
    nm := btrim(r ->> 'name');
    pr := (r ->> 'price')::numeric;
    asg := coalesce(array(select jsonb_array_elements_text(coalesce(r -> 'assigned_users', '[]'::jsonb))), '{}');
    rid := nullif(r ->> 'id', '')::uuid;
    select * into old_it from public.items where id = rid and session_id = p_session;
    if found then
      if old_it.name is distinct from nm or old_it.price is distinct from pr or old_it.assigned_users is distinct from asg then
        update public.items set name = nm, price = pr, assigned_users = asg where id = rid;
        changed := changed || nm;
      end if;
      keep := keep || rid;
    else
      insert into public.items (session_id, name, price, assigned_users) values (p_session, nm, pr, asg) returning id into rid;
      added := added || nm;
      keep := keep || rid;
    end if;
  end loop;

  select coalesce(array_agg(name), '{}') into removed from public.items where session_id = p_session and id <> all(keep);
  delete from public.items where session_id = p_session and id <> all(keep);

  perform set_config('app.items_diff', jsonb_build_object('added', to_jsonb(added), 'removed', to_jsonb(removed), 'changed', to_jsonb(changed))::text, true);
  update public.sessions set
    name = coalesce(nullif(btrim(p_patch ->> 'name'), ''), name),
    session_date = coalesce((p_patch ->> 'session_date')::date, session_date),
    tax = coalesce((p_patch ->> 'tax')::numeric, tax),
    tip = coalesce((p_patch ->> 'tip')::numeric, tip),
    category = coalesce(p_patch ->> 'category', category),
    paid_by = case when p_patch ? 'paid_by' then nullif(p_patch ->> 'paid_by', '')::uuid else paid_by end,
    updated_at = now()
  where id = p_session;
  perform set_config('app.items_diff', '', true);
end $$;
revoke execute on function public.save_receipt(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_receipt(uuid, jsonb, jsonb) to authenticated;

-- New expenses start with nobody selected, so a draft may have an empty split; it is checked when it is saved.
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
    if new.draft is not distinct from old.draft
       and new.amount is not distinct from old.amount
       and new.split_method is not distinct from old.split_method
       and new.split_data is not distinct from old.split_data
       and new.kind is not distinct from old.kind then
      return new;
    end if;
  end if;

  if new.kind <> 'expense' or new.draft then
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
