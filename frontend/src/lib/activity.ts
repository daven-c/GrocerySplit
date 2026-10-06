import type { ExpenseLogEntry, SettlementLogEntry } from './api';
import { categoryOf } from './expenses';
import { fmt } from './people';

const dateText = (iso: unknown) => {
    const d = new Date(`${iso}T00:00`);
    return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
const money = (n: unknown) => fmt(Number(n) || 0);
const who = (v: unknown) => (v ? String(v) : 'nobody');
const method = (m: unknown) => (m === 'exact' ? 'amounts' : m === 'shares' ? 'shares' : m === 'percent' ? 'percent' : m === 'equal' ? 'equally' : String(m ?? 'unset'));

/** One line of "what changed" for an edit. */
export function describeChange(c: ExpenseLogEntry['changes'][number]): string {
    switch (c.field) {
        case 'name': return `Name: "${c.from}" → "${c.to}"`;
        case 'date': return `Date: ${dateText(c.from)} → ${dateText(c.to)}`;
        case 'category': return `Category: ${categoryOf(String(c.from)).label} → ${categoryOf(String(c.to)).label}`;
        case 'paid_by': return `Paid by: ${who(c.from)} → ${who(c.to)}`;
        case 'amount': return `Amount: ${money(c.from)} → ${money(c.to)}`;
        case 'tax': return `Tax: ${money(c.from)} → ${money(c.to)}`;
        case 'tip': return `Tip: ${money(c.from)} → ${money(c.to)}`;
        case 'kind': return c.to === 'receipt' ? 'Now split by item' : 'Now split as one total';
        case 'split': return c.from && c.to && c.from !== c.to ? `Split changed (${method(c.from)} → ${method(c.to)})` : 'Split changed';
        case 'items': {
            const parts = [
                c.added?.length ? `added ${c.added.join(', ')}` : '',
                c.removed?.length ? `removed ${c.removed.join(', ')}` : '',
                c.changed?.length ? `changed ${c.changed.join(', ')}` : '',
            ].filter(Boolean);
            return `Items: ${parts.join('; ')}`;
        }
        default: return c.field;
    }
}

/** One row of the Activity tab: an expense/receipt or a transfer. */
export type ActivityItem =
    | { type: 'expense'; id: string; at: string; entry: ExpenseLogEntry }
    | { type: 'transfer'; id: string; at: string; entry: SettlementLogEntry };

export const mergeActivity = (expenses: ExpenseLogEntry[], transfers: SettlementLogEntry[]): ActivityItem[] =>
    [
        ...expenses.map(entry => ({ type: 'expense' as const, id: `e-${entry.id}`, at: entry.created_at, entry })),
        ...transfers.map(entry => ({ type: 'transfer' as const, id: `t-${entry.id}`, at: entry.created_at, entry })),
    ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
