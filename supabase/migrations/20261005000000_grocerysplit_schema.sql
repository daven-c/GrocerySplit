create table public.people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  members text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  session_date date not null default current_date,
  tax numeric(10,2) not null default 0 check (tax >= 0),
  tip numeric(10,2) not null default 0 check (tip >= 0),
  participants text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  name text not null,
  price numeric(10,2) not null check (price >= 0),
  assigned_users text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index items_session_idx on public.items(session_id);
create index items_user_idx on public.items(user_id);
create index sessions_user_idx on public.sessions(user_id);

alter table public.people enable row level security;
alter table public.groups enable row level security;
alter table public.sessions enable row level security;
alter table public.items enable row level security;

create policy "own people" on public.people for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own groups" on public.groups for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own sessions" on public.sessions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own items" on public.items for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
    and exists (select 1 from public.sessions s where s.id = session_id and s.user_id = (select auth.uid())));
