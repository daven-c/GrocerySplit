# Splitpot

Split any shared cost with the people you share it with: groceries, rent, bills, dinners and trips. Add what was spent, say who shares it, and Splitpot works out who owes whom, with balances that carry across every group you're in. (Formerly GrocerySplit; itemized grocery receipts are still a first-class feature.)

## Two ways to add a cost

- **Groceries (itemized receipt):** open a blank receipt and type the items in, or press **Import from JSON** to fill it from a photo read by any AI chat. Pick a person, then tap the items they had; tax and tip are shared in proportion to what each person bought.
- **One expense editor:** rent, utilities, dinner, a trip, a grocery run. Choose who paid and who shares it, then pick **Split by**: **amounts** (the default, starting as an even split you can adjust), **shares** (e.g. two shares for the bigger room), or **by item** (the itemized receipt editor, with tax, tip and JSON import). Switching keeps the name, payer and date. The editor shows live per-person amounts and won't save a split that doesn't add up.

**Nothing is added until you press Save.** A new bill or receipt opens as a draft that nobody else in the group sees and that doesn't count toward balances; **Save** publishes it and **Discard** (or leaving the screen) throws it away. Existing expenses autosave as you edit them.

Both kinds live in the same group, have a category, a payer and a date, and feed the same balances.

## How it's organised

- **Quick split** (no account, no group): one shareable page for splitting a single bill, e.g. at dinner. Start it from the landing page or Home, share the link (`/s/<token>`), and everyone opens it, picks a unique name and taps what they had. Anyone with the link can edit; only the owner can rename or lock it, and a split nobody touches for 30 days is deleted. Splits made while signed in (or claimed with the owner key) are listed under **Personal** until they expire, and the owning account can manage them from any device. A signed-in person can import it into a group, matching each name to a member. The link's long random token is the only credential, and the tables are closed: everything goes through the `qs_*` database functions.
- **Usernames and invites:** every account has a display name, a unique `@username` and a private email. Owners invite by `@username` only. While an invite is pending the person can already be used in expenses, and when they accept everything moves to their account under their display name. Emails are never shown to the group.
- **People** (the old Friends page) shows what you and each person owe across your shared groups.
- **Personal** is its own private section for tracking what you paid for others by name only. Those names are not accounts and never appear under People.
- **Home** can search groups (by group or person), sort them (recent activity, name, balance, spend), and pin groups to the top for yourself.
- **Feature flags** (`frontend/src/lib/flags.ts`): the Activity tab is **off** for now (the database still records it), while Quick split and Personal are on. Turn flags on or off per build with `VITE_FEATURES="activity,-personal"`, or per browser with `localStorage['splitpot:flags'] = '{"activity":true}'`. A flag only hides a feature; it never deletes data.
- **Groups** are the top level (a household, a trip, ...). Create one, then invite people by email.
- **Expenses live inside a group.** Every member can see and edit the group's receipts and bills.
- **Invites** are matched on the invitee's login email and show up on their home screen, so no email service is needed. Invitees accept or decline. An invited person (optionally with a name) is usable in expenses right away, marked *Invited*; when they accept, everything they were in (payer, shares, transfers, receipt items) moves to their account. An invite can't be cancelled while they're in expenses.
- The owner can invite, remove members and delete the group; any member can leave.
- **Transfers:** marking a balance paid records a *transfer* that shows up in the group's list (with an undo). Record one by hand from the Add menu with two dropdowns, *who paid* and *who received*. Each group has a **Balances** tab that shows how much each person is up or down, with the fewest transfers that would settle everyone below.
- **Friends** (sidebar / tab bar) shows what you owe and are owed across every group. Each receipt has a *Paid by* member; everyone else on it owes the payer their share, and you can mark payments as settled.
- **Admin** (nav item, admins only) lists every user with sign-in and activity counts, force-creates confirmed accounts, and force-confirms stuck signups. It runs through the `admin-users` Supabase Edge Function (`supabase/functions/admin-users`), which checks the caller against the `admins` table before touching the service-role key. Add the first admin with SQL: `insert into admins select id from profiles where email = '...'`.
- **Account** (sidebar / tab bar) lets you change your display name, email and password, or sign out.

## How receipt import works (grocery receipts)

There is no built-in AI. Instead:

1. Open **Import Receipt** and tap **Copy prompt**.
2. Paste the prompt into any AI chat (ChatGPT, Claude, Gemini, ...) along with a photo of your receipt.
3. Paste the JSON it returns (or upload it as a `.json` file) and tap **Import & split**.

Expected JSON (the prompt asks the model for exactly this):

```json
{
  "store": "Corner Market",
  "date": "2026-10-05",
  "items": [{ "name": "Oat Milk", "price": 7.5 }],
  "tax": 1.25,
  "tip": 0
}
```

The importer also tolerates markdown code fences, surrounding chatter, `"$3.50"` strings and a bare `[...]` array.

## Split math

All money is handled in integer cents with largest-remainder allocation, so per-person totals always add up exactly. Receipts split each item among its assignees, then share tax and tip by what each person bought (`frontend/src/lib/calc.ts`). Standalone expenses use the same allocator for all four split methods (`frontend/src/lib/expenses.ts`).

See [docs/ROADMAP.md](docs/ROADMAP.md) for where this is heading (a general cost-splitting app, not just groceries).

## Tech stack

| Layer    | Technology                                                     |
| -------- | -------------------------------------------------------------- |
| Frontend | React + TypeScript, Vite, Tailwind (build-time), Framer Motion |
| Auth/DB  | Supabase (Auth + Postgres with row-level security)             |
| Hosting  | Vercel (static build)                                          |

Access is enforced in Postgres with row-level security: you can only see groups you belong to and their receipts, and only owners can invite or remove people (`profiles`, `groups`, `group_members`, `group_invites`, `sessions`, `items`, `people`).

## Local development

```bash
cd frontend
cp .env.example .env.local   # fill in your Supabase URL + anon/publishable key
npm install
npm run dev                  # http://localhost:3000
npm run dev:mock             # same UI with an in-memory fake backend (src/mocks): no Supabase or login needed
npm test                     # unit + component tests (split math, balances, every screen's interactions)
```

`npm run test:integration` runs against the real Supabase project; see the header of `src/lib/__tests__/integration.test.ts` for the setup it needs.

## Deploying

- **Supabase:** create a project and run the SQL files in `supabase/migrations/` in order. For instant sign-up without an email step, disable *Confirm email* under Authentication → Providers → Email; keep it on if you set up SMTP, because invites are matched on the login email. Also consider enabling leaked-password protection.
- **Vercel:** connect the GitHub repo, set the project root directory to `frontend`, and add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for Production and Preview. Every push to `main` then deploys to production and every PR gets a preview deployment.
- **CI:** `.github/workflows/ci.yml` runs the unit tests and a production build on every PR and every push to `main` or `dev`.
- **Edge function is not deployed by CI.** Deploy `supabase/functions/admin-users` with the Supabase CLI or dashboard when it changes.
- **Database migrations are not automated.** Apply new files in `supabase/migrations/` to the Supabase project before merging a change that needs them.
