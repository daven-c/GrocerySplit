-- Reference photos (e.g. of a receipt) on an expense. Up to 3 per expense, visible to the whole group.
-- Files live in a private Storage bucket under <group id>/<session id>/<file>; access follows group membership.

create table public.session_photos (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  path text not null unique,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index session_photos_session_idx on public.session_photos(session_id);
create index session_photos_group_idx on public.session_photos(group_id);

alter table public.session_photos enable row level security;

create policy "members see photos" on public.session_photos for select to authenticated
  using (public.is_group_member(group_id));
create policy "members add photos" on public.session_photos for insert to authenticated
  with check (
    public.is_group_member(group_id)
    and created_by = (select auth.uid())
    and exists (select 1 from public.sessions s where s.id = session_id and s.group_id = session_photos.group_id)
    and path like group_id::text || '/' || session_id::text || '/%'
  );
create policy "members remove photos" on public.session_photos for delete to authenticated
  using (public.is_group_member(group_id));

revoke all on public.session_photos from anon;
grant select, insert, delete on public.session_photos to authenticated;

create function public.limit_session_photos() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.sessions where id = new.session_id for update; -- serialise concurrent uploads
  if (select count(*) from public.session_photos where session_id = new.session_id) >= 3 then
    raise exception 'An expense can have up to 3 photos.';
  end if;
  return new;
end $$;
revoke execute on function public.limit_session_photos() from public, anon, authenticated;
create trigger session_photos_limit before insert on public.session_photos
  for each row execute function public.limit_session_photos();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipt-photos', 'receipt-photos', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "members read receipt photos" on storage.objects for select to authenticated
  using (bucket_id = 'receipt-photos' and public.is_group_member(((storage.foldername(name))[1])::uuid));
create policy "members upload receipt photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'receipt-photos' and public.is_group_member(((storage.foldername(name))[1])::uuid));
create policy "members delete receipt photos" on storage.objects for delete to authenticated
  using (bucket_id = 'receipt-photos' and public.is_group_member(((storage.foldername(name))[1])::uuid));
