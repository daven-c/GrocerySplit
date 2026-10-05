-- General cost splitting. A row in `sessions` is now either:
--   kind = 'receipt': an itemized receipt (the grocery flow; items live in `items`), or
--   kind = 'expense': a standalone cost (rent, bills, dinner, a trip) with a total and a split method.
-- Existing rows become receipts in the 'groceries' category. Access rules (RLS) are unchanged.
alter table public.sessions
  add column kind text not null default 'receipt' check (kind in ('receipt', 'expense')),
  add column category text not null default 'groceries' check (length(btrim(category)) between 1 and 30),
  add column amount numeric(10,2) check (amount >= 0),
  add column split_method text check (split_method in ('equal', 'exact', 'percent', 'shares')),
  -- { "<member user_id>": number }. equal: presence = included; exact: dollars; percent: percent; shares: weight.
  add column split_data jsonb not null default '{}'::jsonb;

alter table public.sessions
  add constraint sessions_expense_fields check (kind = 'receipt' or (amount is not null and split_method is not null));

create index sessions_group_kind_idx on public.sessions(group_id, kind);
