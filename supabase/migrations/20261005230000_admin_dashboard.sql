-- Admin dashboard support. Admins are rows in public.admins, which clients can read (their own row)
-- but never write; add or remove admins with SQL or the service role.
create table public.admins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
create policy "see own admin row" on public.admins for select to authenticated
  using (user_id = (select auth.uid()));

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()))
$$;

-- Every account with activity counts. Counts only: admins cannot read other people's receipts here.
create function public.admin_list_users() returns table (
  id uuid, email text, name text, created_at timestamptz, last_sign_in_at timestamptz,
  email_confirmed boolean, is_admin boolean, groups_count bigint, receipts_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return query
    select u.id, p.email, p.name, u.created_at, u.last_sign_in_at,
           (u.email_confirmed_at is not null),
           exists (select 1 from public.admins a where a.user_id = u.id),
           (select count(*) from public.group_members m where m.user_id = u.id),
           (select count(*) from public.sessions s where s.user_id = u.id)
    from auth.users u join public.profiles p on p.id = u.id
    order by u.created_at desc;
end $$;

create function public.admin_totals() returns table (groups bigint, receipts bigint, items bigint, settlements bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return query select (select count(*) from public.groups), (select count(*) from public.sessions),
                       (select count(*) from public.items), (select count(*) from public.settlements);
end $$;

revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.admin_list_users() from public, anon;
revoke execute on function public.admin_totals() from public, anon;
grant execute on function public.is_admin(), public.admin_list_users(), public.admin_totals() to authenticated;
