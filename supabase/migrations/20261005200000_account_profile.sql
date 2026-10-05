-- Account page support.
-- Users may edit only their display name on their profile; email is mirrored from auth.users.
revoke update on public.profiles from authenticated, anon;
grant update (name) on public.profiles to authenticated;

alter table public.profiles add constraint profiles_name_not_blank check (length(btrim(name)) > 0);

create function public.sync_profile_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = lower(new.email) where id = new.id;
  return new;
end $$;

create trigger on_auth_user_email_changed after update of email on auth.users
for each row when (old.email is distinct from new.email)
execute function public.sync_profile_email();

revoke execute on function public.sync_profile_email() from public, anon, authenticated;
