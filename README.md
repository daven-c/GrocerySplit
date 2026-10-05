# GrocerySplit

Import a grocery receipt, tap once per item to assign it to a friend, and get an exact split — tax and tip included.

## How it's organised

- **Groups** are the top level (a household, a trip, ...). Create one, then invite people by email.
- **Receipts live inside a group.** Every member can see and edit the group's receipts.
- **Invites** are matched on the invitee's login email and show up on their home screen, so no email service is needed. Invitees accept or decline.
- The owner can invite, remove members and delete the group; any member can leave.
- **People** (bottom nav) are saved guest names you can add to a receipt even if they don't have an account.

## How receipt import works

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

All money is handled in integer cents. Each item is split evenly among its assignees, and tax and tip are shared in proportion to what each person's items cost. Leftover pennies are distributed by largest remainder, so per-person totals always add up exactly to items + tax + tip (see `frontend/src/lib/calc.ts`).

## Tech stack

| Layer    | Technology                                                     |
| -------- | -------------------------------------------------------------- |
| Frontend | React + TypeScript, Vite, Tailwind (CDN)                       |
| Auth/DB  | Supabase (Auth + Postgres with row-level security)             |
| Hosting  | Vercel (static build)                                          |

Access is enforced in Postgres with row-level security: you can only see groups you belong to and their receipts, and only owners can invite or remove people (`profiles`, `groups`, `group_members`, `group_invites`, `sessions`, `items`, `people`).

## Local development

```bash
cd frontend
cp .env.example .env.local   # fill in your Supabase URL + anon/publishable key
npm install
npm run dev                  # http://localhost:3000
npm test                     # unit tests (split math + JSON import)
```

`npm run test:integration` runs against the real Supabase project; see the header of `src/lib/__tests__/integration.test.ts` for the setup it needs.

## Deploying

- **Supabase:** create a project and run the SQL files in `supabase/migrations/` in order. For instant sign-up without an email step, disable *Confirm email* under Authentication → Providers → Email; keep it on if you set up SMTP, because invites are matched on the login email. Also consider enabling leaked-password protection.
- **Vercel:** set the project root to `frontend`, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` environment variables, and deploy.
