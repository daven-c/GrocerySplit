-- Only the owner of a quick split can rename it (everything else stays open to anyone with the link).
create or replace function public.qs_set(p_token text, p_patch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.quick_splits; pb text;
begin
  s := public._qs_load(p_token, true);
  if p_patch ? 'title' then raise exception 'Only the owner can rename this split.'; end if;
  if p_patch ? 'paid_by' then
    pb := nullif(btrim(p_patch ->> 'paid_by'), '');
    if pb is not null and not exists (select 1 from public.quick_split_people where split_id = s.id and name = pb) then
      raise exception 'Whoever paid has to be on the split.';
    end if;
  else
    pb := s.paid_by;
  end if;
  update public.quick_splits set
    tax = case when p_patch ? 'tax' then (p_patch ->> 'tax')::numeric else tax end,
    tip = case when p_patch ? 'tip' then (p_patch ->> 'tip')::numeric else tip end,
    paid_by = pb
  where id = s.id;
  perform public._qs_touch(s.id);
end $$;

-- The owner can rename even while it is locked.
create function public.qs_rename(p_token text, p_owner_key text, p_title text) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.quick_splits; t text := btrim(coalesce(p_title, ''));
begin
  s := public._qs_load(p_token, false);
  if s.owner_hash <> sha256(convert_to(coalesce(p_owner_key, ''), 'utf8')) then raise exception 'Only the owner can rename this split.'; end if;
  if length(t) < 1 or length(t) > 80 then raise exception 'Titles are 1 to 80 characters.'; end if;
  update public.quick_splits set title = t where id = s.id;
  perform public._qs_touch(s.id);
end $$;
revoke execute on function public.qs_rename(text, text, text) from public;
grant execute on function public.qs_rename(text, text, text) to anon, authenticated;
