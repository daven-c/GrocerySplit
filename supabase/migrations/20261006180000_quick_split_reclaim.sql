-- Someone who lost their session (cleared browser, new phone) can tap their own name again ("I'm Ann") and get a new
-- private key. A person can hold several keys (one per device); the newest five are kept. This is honor-system by
-- design: the link already lets anyone join, and the owner can remove anyone.

alter table public.quick_split_people add column key_hashes bytea[] not null default '{}';
update public.quick_split_people set key_hashes = array[key_hash] where key_hash is not null;
alter table public.quick_split_people drop column key_hash;

create or replace function public.qs_join(p_token text, p_name text) returns text
language plpgsql security definer set search_path = '' as $$
declare s public.quick_splits; n text := btrim(p_name); k text;
begin
  s := public._qs_load(p_token, true);
  if length(n) < 1 or length(n) > 30 then raise exception 'Names are 1 to 30 characters.'; end if;
  if (select count(*) from public.quick_split_people where split_id = s.id) >= 60 then raise exception 'This split is full.'; end if;
  k := replace(gen_random_uuid()::text, '-', '');
  begin
    insert into public.quick_split_people (split_id, name, key_hashes) values (s.id, n, array[sha256(convert_to(k, 'utf8'))]);
  exception when unique_violation then
    raise exception 'That name is taken.';
  end;
  perform public._qs_touch(s.id);
  return k;
end $$;

-- "I'm Ann": a fresh key for an existing name.
create function public.qs_reclaim(p_token text, p_name text) returns text
language plpgsql security definer set search_path = '' as $$
declare s public.quick_splits; k text; n text := btrim(p_name);
begin
  s := public._qs_load(p_token, true);
  if not exists (select 1 from public.quick_split_people where split_id = s.id and name = n) then raise exception 'That person is not on the split.'; end if;
  k := replace(gen_random_uuid()::text, '-', '');
  update public.quick_split_people set key_hashes = (array_append(key_hashes, sha256(convert_to(k, 'utf8'))))[greatest(1, cardinality(key_hashes) + 1 - 4):]
    where split_id = s.id and name = n;
  perform public._qs_touch(s.id);
  return k;
end $$;
revoke execute on function public.qs_reclaim(text, text) from public;
grant execute on function public.qs_reclaim(text, text) to anon, authenticated;

create or replace function public.qs_assign(p_token text, p_item uuid, p_person text, p_on boolean, p_member_key text default null, p_owner_key text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.quick_splits; pk bytea[];
begin
  s := public._qs_load(p_token, true);
  select key_hashes into pk from public.quick_split_people where split_id = s.id and name = p_person;
  if not found then raise exception 'That person is not on the split.'; end if;
  if not (public._qs_is_owner(s, p_owner_key) or sha256(convert_to(coalesce(p_member_key, ''), 'utf8')) = any(pk)) then
    raise exception 'You can only choose items for yourself.';
  end if;
  update public.quick_split_items set assigned = case
      when p_on and not (p_person = any(assigned)) then array_append(assigned, p_person)
      when not p_on then array_remove(assigned, p_person)
      else assigned end
    where id = p_item and split_id = s.id;
  perform public._qs_touch(s.id);
end $$;
