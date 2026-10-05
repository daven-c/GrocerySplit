-- One editor, one "Split by" control: an expense can switch between an itemized split (kind 'receipt') and the other
-- split methods (kind 'expense'). Items are kept when switching away, so switching back loses nothing.
-- The group still can't change. A switch to 'expense' is validated like any other change to its split.
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
    if new.kind is not distinct from old.kind
       and new.amount is not distinct from old.amount
       and new.split_method is not distinct from old.split_method
       and new.split_data is not distinct from old.split_data then
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
    if not exists (select 1 from public.group_members m where m.group_id = new.group_id and m.user_id::text = k) then
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
