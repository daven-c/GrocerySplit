-- Server-side validation for standalone expenses (defence in depth: the client already checks all of this).
--  * kind and group_id can't change after creation
--  * when an expense's amount or split changes, the split must name only current group members, contain no
--    negative values, and add up (exact = amount, percent = 100, shares > 0, at least one person)
-- Edits that don't touch the split (renaming, changing the payer) are never blocked by an old split.
create function public.validate_expense() returns trigger
language plpgsql set search_path = '' as $$
declare
  k text;
  v numeric;
  n int := 0;
  total numeric := 0;
begin
  if tg_op = 'UPDATE' then
    if new.kind is distinct from old.kind then
      raise exception 'A record cannot change between receipt and expense';
    end if;
    if new.group_id is distinct from old.group_id then
      raise exception 'A record cannot move to another group';
    end if;
    if new.amount is not distinct from old.amount
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

create trigger sessions_validate_expense before insert or update on public.sessions
for each row execute function public.validate_expense();
