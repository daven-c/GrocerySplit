# Roadmap & ideas

The app started as **GrocerySplit** (one receipt, tap items, split between people). The direction is a
general **cost-splitting app** for any shared expense: groceries, rent, utilities, trips, dinners, gifts.
Live at https://costsplit.davenc.dev (domain already named for the broader product).

## Where it is today
- Groups at the top level, receipts inside, members invited by email.
- Receipts imported from model-generated JSON (itemized), tax/tip shared proportionally, exact-penny math.
- Friends view: what you owe / are owed across all groups, with manual "mark paid" settlements.

## Product ideas, roughly in priority order

### 1. Expenses that aren't receipts
Today every expense is an itemized receipt. Add a lightweight **expense** type so splitting rent, a
utility bill or a taxi takes ten seconds:
- Total + payer + who's in, no items.
- **Split modes**: equally, by exact amounts, by percentage, by shares/weights (e.g. rooms or nights).
- Keep itemized receipts as one expense type that happens to have line items.
- Category + notes + optional photo of the receipt (Supabase Storage).

### 2. Better settling up
- **Simplify debts** inside a group (A owes B, B owes C → A pays C) to minimise payments.
- Payment deep links (Venmo, Cash App, PayPal.me, Zelle details) from the "you owe" row.
- Partial payments, notes, and "request payment" reminders.
- Per-group view of who owes whom, not only the per-friend rollup.

### 3. People without accounts
- Add **guests/placeholder members** to a group by name; they can claim the spot later by accepting an
  invite (balances carry over). Replaces the removed "People" list.
- Shareable invite link/QR in addition to invite-by-email.

### 4. Identity and data model cleanup
- Receipt participants are stored as **display-name strings** today. Move to member ids so duplicate
  names can't collide and renaming a member doesn't orphan assignments. Prerequisite for most of the above.
- Per-group currency, plus multi-currency groups with a stored exchange rate per expense.
- Audit trail / activity feed per group ("Sam edited Costco, deleted Gum") and undo for deletes.
- Roles beyond owner/member (e.g. read-only viewers, co-owners), configurable edit permissions.

### 5. Recurring and scheduled
- Recurring expenses (rent on the 1st, subscriptions) that post automatically.
- Monthly group summaries.

### 6. Notifications and delivery
- Transactional email via custom SMTP (Resend/Postmark) so signup confirmation, invites and reminders
  aren't capped by the default 2-per-hour mailer. Needs DNS records on davenc.dev.
- Web push / PWA install, offline entry that syncs later.
- Optional: import by emailing a receipt to a group address.

### 7. Receipt capture
- Keep the "copy prompt, paste JSON" import (no LLM dependency in the app). Possible later: a one-click
  "bring your own API key" mode kept strictly opt-in and client-side.
- Edit/merge duplicate lines, quantity handling, and per-item tax rates.

### 8. Insights and export
- Spend by category/month per group, CSV/PDF export, shareable read-only summary link.

## Engineering ideas
- Rename the repo, README and UI strings from GrocerySplit to the new product name.
- Supabase migrations applied automatically from CI on merge to `main` (needs an access token secret).
- Playwright smoke tests against a preview deployment using a seeded test user.
- Replace the Tailwind CDN script with a build-time Tailwind setup (faster first paint, no CDN dependency).
- Code-split the bundle; add error reporting.
- Make Supabase Auth Site URL / redirect URLs match the custom domain.
