-- Richer admin metrics in one call: growth, engagement, content, money and storage, plus 30-day daily series.
-- Counts and totals only; admins still cannot read other people's receipts.
create function public.admin_metrics() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'users', jsonb_build_object(
      'total', (select count(*) from auth.users),
      'confirmed', (select count(*) from auth.users where email_confirmed_at is not null),
      'new_24h', (select count(*) from auth.users where created_at > now() - interval '1 day'),
      'new_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
      'new_30d', (select count(*) from auth.users where created_at > now() - interval '30 days'),
      'active_24h', (select count(*) from auth.users where last_sign_in_at > now() - interval '1 day'),
      'active_7d', (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
      'active_30d', (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days'),
      'never_signed_in', (select count(*) from auth.users where last_sign_in_at is null),
      'with_expense', (select count(distinct actor) from public.expense_log where action = 'created')
    ),
    'content', jsonb_build_object(
      'groups', (select count(*) from public.groups where not personal),
      'shared_groups', (select count(*) from public.groups g where not g.personal
                         and (select count(*) from public.group_members m where m.group_id = g.id) > 1),
      'expenses', (select count(*) from public.sessions where not draft and kind = 'expense'),
      'receipts', (select count(*) from public.sessions where not draft and kind = 'receipt'),
      'drafts', (select count(*) from public.sessions where draft),
      'items', (select count(*) from public.items),
      'photos', (select count(*) from public.session_photos),
      'guests', (select count(*) from public.group_guests),
      'pending_invites', (select count(*) from public.group_invites where status = 'pending')
    ),
    'money', jsonb_build_object(
      'expense_total', (select coalesce(sum(amount), 0) from public.sessions where not draft and kind = 'expense'),
      'payments', (select count(*) from public.settlements),
      'payments_total', (select coalesce(sum(amount), 0) from public.settlements)
    ),
    'quick', jsonb_build_object(
      'total', (select count(*) from public.quick_splits),
      'new_7d', (select count(*) from public.quick_splits where created_at > now() - interval '7 days'),
      'live_7d', (select count(*) from public.quick_splits where updated_at > now() - interval '7 days'),
      'locked', (select count(*) from public.quick_splits where locked)
    ),
    'activity', jsonb_build_object(
      'edits_7d', (select count(*) from public.expense_log where created_at > now() - interval '7 days'),
      'payments_7d', (select count(*) from public.settlement_log where created_at > now() - interval '7 days')
    ),
    'series', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', d::date,
        'signups', (select count(*) from auth.users u where u.created_at::date = d::date),
        'expenses', (select count(*) from public.expense_log e where e.action = 'created' and e.created_at::date = d::date),
        'payments', (select count(*) from public.settlement_log s where s.action = 'created' and s.created_at::date = d::date),
        'quick', (select count(*) from public.quick_splits q where q.created_at::date = d::date)
      ) order by d), '[]'::jsonb)
      from generate_series(current_date - 29, current_date, interval '1 day') d
    ),
    'top_groups', (
      select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select g.name, (select count(*) from public.group_members m where m.group_id = g.id) as members,
               (select count(*) from public.sessions s where s.group_id = g.id and not s.draft) as expenses
        from public.groups g where not g.personal order by 3 desc, 2 desc limit 5) t
    )
  ) into r;
  return r;
end $$;

revoke execute on function public.admin_metrics() from public, anon;
grant execute on function public.admin_metrics() to authenticated;
