-- profiles only allowed updating `name` (column-level grant from the hardening migration), so changing a username
-- failed with "permission denied". The format check and unique index still guard the value.
grant update (username) on public.profiles to authenticated;
