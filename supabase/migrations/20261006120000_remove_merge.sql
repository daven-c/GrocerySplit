-- Merging people is gone (it needs a better way to prevent duplicates first). Renaming, removing and claiming remain.
drop function if exists public.merge_guest(uuid, uuid);
