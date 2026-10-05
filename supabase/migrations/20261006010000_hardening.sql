-- Advisor follow-ups: pin the trigger function's search_path, and index foreign keys used in joins/cascades.
alter function public.default_paid_by() set search_path = '';

create index if not exists groups_owner_idx on public.groups(owner_id);
create index if not exists group_invites_invited_by_idx on public.group_invites(invited_by);
create index if not exists sessions_paid_by_idx on public.sessions(paid_by);
create index if not exists settlements_from_idx on public.settlements(from_user);
create index if not exists settlements_to_idx on public.settlements(to_user);
create index if not exists settlements_created_by_idx on public.settlements(created_by);
