# Settled

Split any shared cost with the people you share it with: groceries, rent, bills, dinners and trips. Add what was spent, say who shares it, and Settled works out who owes whom, with balances that carry across every group you're in. All money is handled in whole cents, so totals always add up. (Formerly GrocerySplit, then Splitpot. Itemized grocery receipts are still a first-class feature.)

Live at https://settled.davenc.dev (the `dev` branch deploys to https://dev.settled.davenc.dev).

## What you can do

### Groups and expenses
- **Groups** are the top level: a household, a trip, a club. Every member can see and edit the group's expenses. The owner invites people, removes members and deletes the group; any member can leave.
- **Add an expense** (rent, bills, one total): choose who paid and who shares it, then **Split by amounts** (starts as an even split; type an amount and the people you haven't edited share what's left) or **by shares** (e.g. two shares for the bigger room). The editor shows live per-person amounts and won't save a split that doesn't add up.
- **Split by item** (groceries, dinners): type the items in, or use **Import items from a photo** (see below), then pick a person and tap the items they had. Tax and tip are shared in proportion to what each person bought.
- **Nothing is added until you press Save.** A new expense or receipt opens as a draft that nobody else sees and that doesn't count toward balances. **Save** publishes it, **Discard** (or leaving) throws it away, and drafts older than a day are cleaned up. Changes to an existing expense are written when you press **Save changes** (one entry in Activity per save).
- **Reference photos:** attach up to 3 photos (say, of the receipt) to any expense. They're stored privately, visible to the group, and deleted with the expense. The photos are not read or split.
- **Transfers:** marking a balance paid records a *transfer* in the group's list (with edit and undo for anyone). Record one by hand from the **Add** menu with *who paid* and *who received*. Each group's **Balances** tab shows how much each person is up or down, with the fewest transfers that would settle everyone.
- Every record has a category, a payer and a date (your local date). The group shows its total cost.

### People
- Every account has a display name, a unique `@username` and a private email. Emails are never shown to a group.
- Owners **invite by `@username`**. While an invite is pending the person can already be used in expenses; when they accept, everything they were in moves to their account.
- **Temporary people:** for a friend who hasn't signed up, the owner can **add a temporary person by name**. They can be used in expenses like anyone else. When the friend signs up, use **Link to account** (their username) and their expenses move to their account when they accept.
- **Receipts name people by account id, not by display name**, so two members called "Sam" stay separate. Where two names match, the app shows `Sam (@sam_k)` and `Sam (@sam_r)`.
- **People** (top navigation) shows what you and each person owe across your shared groups, with each person's `@username`.

### Personal
A private notebook only you can see, for tracking what you paid for others outside any group. It's one page, not a group: a ledger of expenses, totals (spent, owed to you, you owe), and a **Balances | People** switch.
- People here are **names**. Optionally add a `@username` to **link** a name to an account without inviting or notifying anyone. A linked person shows on **People** as a separate, private "Personal" line. Personal never counts toward the amounts on Home or People.

### Quick split (no account)
One shareable page for splitting a single bill, e.g. at dinner.
- **Start a quick split** from the landing page, Home or the nav. It opens a **draft** at `/s/new`: set it up with items and who had what, and **nothing is saved or created until you press Create**. Leaving throws the draft away.
- **Create** makes the real split and gives you its link (`/s/<token>`). Anyone with the link can join with a unique name and tap their own items (a private key from joining stops people tapping each other's names; lose your session and tap your own name again for a fresh key, honor system). Anyone who has joined can add an item. Only the owner can edit or delete items, change tax, tip or who paid, remove people, rename or lock it, or save it to a group.
- A split nobody touches for 30 days is deleted (a daily job removes them). Creating is limited per visitor (10 an hour, 40 a day) on top of a global cap.
- A draft with something in it asks before the page is left (the browser's own prompt). Signed-out owners are told to sign in to keep and manage it from any device. Splits made while signed in (or claimed with the owner key) are listed on **Home** under **Your quick splits** until they expire. A signed-in owner can import one into a group, matching each name to a member.
- The long random token in the link is the only credential. The tables are closed: everything goes through the `qs_*` database functions.

### Home, search and accounts
- **Home** shows your overall balance, invites, your groups (search by group or person, sort by recent, balance, name or spend, pin to the top) and your quick splits.
- **Account** lets you change your display name, username, email and password, download your data as a JSON file, delete your account, or sign out. Deleting needs `DELETE` typed to confirm and is refused while you own a group other people are in (delete it first). Your Personal section and groups nobody else is in are deleted with you; in other people's groups you're removed, and expenses you added stay but stop counting toward balances, as if you had left. **Forgot password?** on the sign-in screen sends a reset link; the link opens a "Choose a new password" screen. Signing in with an unconfirmed email says so and offers to resend the confirmation link.
- The app re-fetches shared data when you return to the tab and once a minute while you're looking at it (but not while you're typing), so other people's changes show up without a reload.
- **Admin** (admins only) lists every user with sign-in and activity counts, force-creates confirmed accounts and force-confirms stuck signups. It runs through the `admin-users` Edge Function, which checks the caller against the `admins` table before touching the service-role key. Add the first admin with SQL: `insert into admins select id from profiles where email = '...'`.

### Feature flags
`frontend/src/lib/flags.ts`: **Activity** is off for now (the database still records it); **Quick split** and **Personal** are on. Set `VITE_FEATURES="activity,-personal"` for a build, or `localStorage['splitpot:flags'] = '{"activity":true}'` for one browser (the old key name is kept so saved preferences survive the rename). A flag only hides a feature; it never deletes data.

## Importing a receipt (no built-in AI)
In **Split by item**, choose **Import items from a photo**:
1. Tap **Copy prompt** and paste it into any AI chat (ChatGPT, Claude, Gemini, ...) along with a photo of your receipt.
2. Paste the JSON it returns (or upload it as a `.json` file) and tap **Import and split**.

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
All money is integer cents with largest-remainder allocation, so per-person totals always add up exactly. Receipts split each item among its assignees, then share tax and tip by what each person bought (`frontend/src/lib/calc.ts`). Standalone expenses use the same allocator for both split methods (`frontend/src/lib/expenses.ts`). Balances and the per-group ledger live in `lib/balances.ts` and `lib/ledger.ts`.

## Tech stack

| Layer    | Technology                                                                           |
| -------- | ------------------------------------------------------------------------------------ |
| Frontend | React + TypeScript, Vite (code-split), Tailwind (build-time), Framer Motion          |
| Auth/DB  | Supabase (Auth, Postgres with row-level security, Storage, Edge Functions, pg_cron)  |
| Email    | Supabase Auth through custom SMTP (e.g. Resend)                                      |
| Hosting  | Vercel (static build)                                                                |

Access is enforced in Postgres with row-level security: you can only see groups you belong to and their records, and only owners can invite or remove people. Reference photos live in a private Storage bucket with access rules that follow group membership.

## Local development

```bash
cd frontend
cp .env.example .env.local   # fill in your Supabase URL + anon/publishable key
npm install
npm run dev                  # http://localhost:3000
npm run dev:mock             # same UI with an in-memory fake backend (src/mocks): no Supabase or login needed
npm test                     # unit, component, accessibility and whole-app tests
npm run lint                 # ESLint (also runs in CI)
npm run build                # type-check and production build
```

- `npm test` includes a whole-app test (`flow.test.tsx`: Home, open a group, add and save an expense) that runs against the in-memory backend, and an automated accessibility check (axe) over the main screens and tests for dialog focus. Colour contrast can't be measured without a real browser, so it's covered by the colour tokens in `tailwind.config.js` (secondary text meets 4.5:1).
- `npm run test:integration` runs against the real Supabase project; see the header of `src/lib/__tests__/integration.test.ts` for the setup it needs.

## Setting up Supabase and deploying

- **Database:** create a project and run the SQL files in `supabase/migrations/` in order. Migrations are **not** automated: apply new files to the Supabase project before merging a change that needs them.
- **Edge Functions** (not deployed by CI; deploy with the Supabase CLI or dashboard when they change):
  - `admin-users`: admin tools, checks the caller against `admins`.
  - `sweep-photos`: deployed *without* JWT verification (it takes no credentials and throttles itself to one scan every 6 hours). It removes photo files that no photo record points to.
- **Scheduled jobs** (created by migrations, need `pg_cron`; the photo sweep also needs `pg_net`): `quick-splits-expire` (daily), `unconfirmed-accounts-expire` (daily; removes accounts that never confirmed their email after 2 days) and `sweep-photos` (weekly).
- **Auth settings** (Authentication in the Supabase dashboard):
  - **URL Configuration:** set the Site URL to your production domain and add every app address to Redirect URLs (production, `dev.` and `http://localhost:3000`, each with `/**`). Reset-password links only work from addresses on that list.
  - **SMTP:** set up custom SMTP (host, port, username, password, and a sender address on a verified domain). Without it Supabase's built-in mailer allows only a couple of emails an hour, and email templates can't be edited.
  - **Email templates:** paste the files from `supabase/email-templates/` (see its README for which goes where).
  - For instant sign-up without an email step, disable *Confirm email* under Providers, Email; keep it on if you set up SMTP. Consider enabling leaked-password protection.
- **Vercel:** connect the GitHub repo, set the project root directory to `frontend`, and add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for Production and Preview. Every push to `main` deploys to production and every other branch and PR gets a preview deployment. Add your domain under the project's Domains.
- **CI:** `.github/workflows/ci.yml` runs lint, the tests and a production build on every PR and every push to `main` or `dev`.

## Search and sharing (SEO)
- `frontend/index.html` carries the title, description, canonical link, Open Graph/Twitter tags (`public/og-image.png`, 1200x630) and JSON-LD for the app, plus plain HTML inside `#root` so a crawler that doesn't run scripts still sees the pitch and links. React replaces it on load.
- `frontend/public/guides/` has static, crawlable guides (groceries, rent, restaurant bills) with their own titles, canonical links and `Article` data. Add a page there, add it to `public/sitemap.xml`, and link to it from the landing footer.
- `public/robots.txt` allows the site but disallows `/s/` (quick split links are private); those pages also send `X-Robots-Tag: noindex` and a `noindex` meta tag. `vercel.json` only rewrites `/s/*` to the app, so any other unknown address is a real 404 (`public/404.html`), and it adds `Referrer-Policy: strict-origin-when-cross-origin` so a quick split token never leaks to other sites.
- The dev domain sits behind Vercel login, so it can't be crawled.

## More

- [docs/ROADMAP.md](docs/ROADMAP.md): where this is heading.
- [docs/REDESIGN_V3.md](docs/REDESIGN_V3.md): the "Corner shop" visual design, what changed and what the design did not cover.
