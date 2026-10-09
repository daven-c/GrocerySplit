-- Create a quick split from a draft in one step: the split, its people, items (with who had what), tax, tip and
-- who paid either all exist afterwards or none of it does. (The app used to make several calls in a row.)
create or replace function public.qs_create_from_draft(
  p_title text, p_people text[], p_items jsonb, p_tax numeric default 0, p_tip numeric default 0, p_paid_by text default null
) returns table (token text, owner_key text)
language plpgsql security definer set search_path = '' as $$
declare t text; k text; sid uuid; r jsonb; n text; names text[] := '{}'; paid text := nullif(btrim(p_paid_by), '');
begin
  select c.token, c.owner_key into t, k from public.qs_create(p_title) c; -- same limits and rules as a plain create
  select id into sid from public.quick_splits where quick_splits.token = t;

  if coalesce(cardinality(p_people), 0) > 60 then raise exception 'A split can have up to 60 people.'; end if;
  foreach n in array coalesce(p_people, '{}') loop
    n := btrim(n);
    if length(n) < 1 or length(n) > 30 then raise exception 'Names are 1 to 30 characters.'; end if;
    begin
      insert into public.quick_split_people (split_id, name, key_hashes) values (sid, n, '{}');
    exception when unique_violation then raise exception 'That name is taken.'; end;
    names := names || n;
  end loop;

  if p_items is not null and jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Items must be a list.'; end if;
  if coalesce(jsonb_array_length(p_items), 0) > 200 then raise exception 'A split can have up to 200 items.'; end if;
  for r in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    insert into public.quick_split_items (split_id, name, price, assigned)
    values (sid, btrim(r ->> 'name'), (r ->> 'price')::numeric,
            coalesce(array(select nm from unnest(names) as nm where nm in (select jsonb_array_elements_text(coalesce(r -> 'assigned', '[]'::jsonb)))), '{}'));
  end loop;

  if paid is not null and not (paid = any(names)) then raise exception 'Whoever paid has to be on the split.'; end if;
  update public.quick_splits set tax = coalesce(p_tax, 0), tip = coalesce(p_tip, 0), paid_by = paid where id = sid;
  perform public._qs_touch(sid);
  return query select t, k;
end $$;
revoke execute on function public.qs_create_from_draft(text, text[], jsonb, numeric, numeric, text) from public;
grant execute on function public.qs_create_from_draft(text, text[], jsonb, numeric, numeric, text) to anon, authenticated;
