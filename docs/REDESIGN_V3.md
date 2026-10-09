# Settled v3 ("Corner shop") redesign: what changed and what the design did not cover

The redesign (`design_handoff_splitpot_redesign 2`) is applied as a **visual layer only**. No data model, API, database or business logic changed. Every existing feature is still reachable; where the design had no screen for one, it is restyled in the new look and listed below.

## Applied
- Nunito type, warm ink `#26221E`, pill controls, soft cards (radius 24, soft shadow), design tokens in `tailwind.config.js`.
- Solid green brand band. The sidebar is gone: desktop has a 72px green top bar (logo, Home / People / Personal / Admin pills, an avatar button that opens Account); phone has a white sticky header with a round back button and a 3-tab bar.
- Home: green hero with the overall balance (the greeting moved there), balance card, warm invite cards ("Not now" / "Join group"), "Your groups" with sort chips and pin buttons.
- Group: tile header, "Add expense" popover, filled-pill tabs with counts, month cards with category icon rows ("you lent" / "your share"), two-column Balances with diverging bars and "Mark paid / Mark received", Members with a mint invite panel.
- Scan a receipt (import), receipt editor (assign panel, chips, "Everyone", share bars), expense editor ("Split it" card), People, Account, Auth (green half + form), Landing (green hero), Quick split (mint share panel, name pills).
- Toasts (ink pill, 2.4s) after save, join, create group, invite, settle and copy.

## Missing from the design (kept, restyled to match)
| Area | The design has no... | What the app does |
|---|---|---|
| **Personal** | Balances tab, people management (add by name, rename, remove), search / month grouping / category filter | Personal is the design's two-column page **plus** the same Expenses / Balances / Members tabs as a group |
| Add menu | "Record a transfer"; "Scan a receipt" was dropped (importing a receipt is part of Split by item) | The menu is Add an expense / Split by item / Record a transfer |
| Group list | transfers (with Edit / Delete) | Shown as rows in the month cards |
| Group | total-cost line, Activity tab | Kept (Activity stays behind the `activity` feature flag, off) |
| Home | group search, "Spent" sort | Search pill and a 4th sort chip |
| Home | quick access to groups from a sidebar | Gone with the sidebar (as designed); groups are one click from Home |
| Members | username invites, name-only people, pending names | Same fields, in the mint panel |
| Receipt editor | category, "Split one total instead", item rename/delete | Category pill select in the details panel; a dashed "Itemized receipt" card; tapping an item name still edits it |
| Expense editor | (kept as before, by request) | The previous layout: the Paid by / date / category card first, above the cost, with a category select; "Who pays what" and "Have a receipt with items?" on the right |
| Auth / Account | username fields | Kept |
| Admin | any screen | Inherits the new tokens only |
| Quick split | join / "I'm Ann" re-select, owner / guest rules, JSON import, lock, rename, delete, save-to-group | All kept; Tax / Tip live in the "Who owes what" card as designed |
| Landing / Members copy | designed for email invites | Says "username" |

## Design notes you may want to revisit
- The design's Personal "Add expense" opens the editor directly; here it opens the same menu as a group so receipts and transfers stay reachable.
- The design's Home balance line always reads "Overall you're up"; here it reads up / down / all square.
- "Suggested transfers" is now titled "Settle up" (the design's wording).
