-- People who have joined a quick split (they hold a member key) may add items too. Editing or deleting an item,
-- tax, tip, who paid and removing people stay with the owner.
drop function public.qs_add_items(text, jsonb, text);

create function public.qs_add_items(p_token text, p_items jsonb, p_owner_key text default null, p_member_key text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.quick_splits; r jsonb;
begin
  s := public._qs_load(p_token, true);
  if not (public._qs_is_owner(s, p_owner_key)
          or exists (select 1 from public.quick_split_people p
                     where p.split_id = s.id and sha256(convert_to(coalesce(p_member_key, ''), 'utf8')) = any(p.key_hashes))) then
    raise exception 'Join the split with your name to add items.';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Items must be a list.'; end if;
  if (select count(*) from public.quick_split_items where split_id = s.id) + jsonb_array_length(p_items) > 200 then
    raise exception 'A split can have up to 200 items.';
  end if;
  for r in select * from jsonb_array_elements(p_items) loop
    insert into public.quick_split_items (split_id, name, price) values (s.id, btrim(r ->> 'name'), (r ->> 'price')::numeric);
  end loop;
  perform public._qs_touch(s.id);
end $$;
revoke execute on function public.qs_add_items(text, jsonb, text, text) from public;
grant execute on function public.qs_add_items(text, jsonb, text, text) to anon, authenticated;
