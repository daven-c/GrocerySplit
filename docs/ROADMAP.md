# Roadmap & ideas

The app started as **GrocerySplit** (one receipt, tap items, split between people), became **Splitpot**, and is now **Settled**: a
general **cost-splitting app** for any shared expense (groceries, rent, utilities, trips, dinners, gifts). Groceries remain a
first-class, itemized flow inside it. Live at https://settled.davenc.dev (the `dev` branch is at https://dev.settled.davenc.dev).

## Where it is today

**Money**
- Groups at the top level, expenses inside, members invited by `@username`.
- **One expense editor** with *Split by* amounts (starts even; amounts you type stay fixed and everyone else shares what is left), shares, or *by item* (itemized receipts with tax and tip shared by what each person bought). Exact-penny math throughout.
- Receipts are read by any AI chat through a copy-and-paste prompt (no model inside the app). Up to 3 reference photos per expense.
- Drafts: nothing is added until you press Save; edits to an existing expense are written on **Save changes**.
- **Transfers** (anyone can add, edit or undo), a per-group **Balances** tab with the fewest transfers that settle everyone, and a **People** page with what you owe and are owed across groups.
- Receipts and expenses name people by **account id**, so two people with the same display name stay apart.

**People**
- Unique `@username`s; emails are never shown to a group. **Temporary people** (just a name) can be used straight away and linked to an account later.
- **Personal**: a private notebook (ledger, balances, people). A name there can be linked to an account without notifying anyone; that shows as a private line on People and never counts toward any total.

**Quick split (no account)**
- A draft at `/s/new` that is only created when you press Create; a shareable link where people tap their own items; owner controls; 30-day expiry (daily cleanup); per-visitor creation limits. Listed on Home for signed-in owners.

**Accounts and safety**
- Forgot password, delete account (with a data download), clear sign-in messages for unconfirmed accounts, and automatic removal of accounts that never confirm (2 days).
- Row-level security on every table; private photo storage; scheduled cleanups (quick splits, unconfirmed accounts, orphaned photo files).

**Quality**
- Accessibility pass with automated axe checks over the main screens, page titles, skip link, focus handling in dialogs, readable text colours.
- ESLint and strict unused-code checks in CI, typed errors and database rows, code-split bundle, ~310 tests including a whole-app flow against the in-memory backend.

## Ideas, roughly in priority order

### 1. More kinds of expenses
- **Multiple payers** on one expense ("A paid 60, B paid 40").
- **Recurring expenses** (rent on the 1st, subscriptions) that post automatically, and monthly group summaries.
- Notes on any expense.

### 2. Better settling up
- Payment deep links (Venmo, Cash App, PayPal.me, Zelle details) from the "you owe" row.
- Partial payments and "request payment" reminders.

### 3. Notifications
- Email reminders and invite notices now that custom SMTP is in place (needs a sending job and unsubscribe handling).
- Web push / PWA install, offline entry that syncs later.
- Optional: import by emailing a receipt to a group address.
- Realtime updates. Today shared data is topped up when you return to the tab and once a minute; Supabase Realtime would make it instant.

### 4. Currency (designed, not built)
Per-group currency looks small but is not: Home and People add balances across groups, so mixing currencies would silently produce
wrong totals. Doing it properly means storing a currency per group, showing totals **per currency** (or converting with a stored
exchange rate per expense), and replacing the hard-coded `$` prefixes and `Intl.NumberFormat('en-US')` formatting in `lib/people.ts`
and the editors. Build it when someone actually needs a non-USD group.

### 5. Roles and history
- Roles beyond owner/member (read-only viewers, co-owners), configurable edit permissions, and **ownership hand-over** (today you must delete a group other people are in before you can delete your account).
- The **Activity** tab (who added, edited or deleted what) is built and recorded by the database but switched off with a feature flag; turn it on when ready, and add undo for deletes.

### 6. Receipt capture
- Keep the "copy prompt, paste JSON" import (no LLM dependency in the app). Possible later: an opt-in "bring your own API key" mode that stays client-side.
- Edit/merge duplicate lines, quantity handling, and per-item tax rates.

### 7. Insights and export
- Spend by category and month per group, CSV/PDF export, a shareable read-only summary link. (A JSON download of your own data already exists under Account.)

### 8. Polish
- Dark mode, more languages, a real-screen-reader pass on phones.

## Engineering ideas
- **Migrations from CI.** Supabase migrations are applied by hand today; apply them from CI on merge to `main` (needs an access token secret).
- **Real-database tests in CI.** The opt-in integration tests (`npm run test:integration`) check access rules against a real project but need test users and secrets, so CI skips them. Point CI at a separate test Supabase project (or a branch) and run them there.
- **Browser smoke tests** (Playwright) against a preview deployment using a seeded test user. The in-memory whole-app test (`flow.test.tsx`) covers the main path without a browser.
- **Error reporting** for the live app.
- **Lighter animation library** (`LazyMotion`) to shrink the animation chunk further.
- **Generated database types:** the client is still untyped (rows are typed by hand in `lib/dbRows.ts`). Typing the client with Supabase's generated types would catch column mistakes at compile time; it needs regenerating whenever a migration lands.
- **Prettier.** Not added on purpose: the code uses long single-line JSX, so formatting the whole tree would rewrite almost every line. Add it together with a one-time formatting commit when no other work is in flight.

## Things only the project owner can do
- In Supabase Auth: set the Site URL and Redirect URLs for the live domains; turn on leaked-password protection (may need a paid plan); keep custom SMTP and the email templates (`supabase/email-templates/`) in sync with the dashboard.
- Deploy edge functions when they change (CI does not): `admin-users` and `sweep-photos`.
