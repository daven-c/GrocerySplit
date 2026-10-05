-- Drafts: a new expense or receipt is created as a draft and only becomes real when the author presses Save.
-- Drafts are invisible to other members (and the app keeps them out of lists and balances); abandoned drafts are
-- cleaned up by the app.
alter table public.sessions add column draft boolean not null default false;

alter policy "members read receipts" on public.sessions
  using (public.is_group_member(group_id) and (not draft or user_id = (select auth.uid())));

create index sessions_draft_idx on public.sessions(user_id) where draft;
