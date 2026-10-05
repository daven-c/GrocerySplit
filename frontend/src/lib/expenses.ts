import { allocate, computeSplit } from './calc';

export type SplitMethod = 'equal' | 'exact' | 'percent' | 'shares';
export type SplitData = Record<string, number>; // member user_id -> value (meaning depends on the method)

export const CATEGORIES = [
    { id: 'groceries', label: 'Groceries', icon: 'shopping_basket' },
    { id: 'rent', label: 'Rent & home', icon: 'home' },
    { id: 'utilities', label: 'Utilities & bills', icon: 'bolt' },
    { id: 'dining', label: 'Dining & drinks', icon: 'restaurant' },
    { id: 'travel', label: 'Travel', icon: 'flight' },
    { id: 'transport', label: 'Transport', icon: 'directions_car' },
    { id: 'entertainment', label: 'Entertainment', icon: 'theaters' },
    { id: 'shopping', label: 'Shopping', icon: 'shopping_bag' },
    { id: 'other', label: 'Other', icon: 'receipt_long' },
] as const;

export const categoryOf = (id: string) => CATEGORIES.find(c => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];

export const METHODS: { value: SplitMethod; label: string; hint: string }[] = [
    { value: 'exact', label: 'Amounts', hint: 'Starts split evenly. Change any amount to adjust it.' },
    { value: 'percent', label: 'Percent', hint: 'Percentages must add up to 100.' },
];

export type SplitBy = SplitMethod | 'items';
/** Every way to split one expense in the editor (older expenses saved as equal/shares open as amounts). "By item" is the itemized (receipt) split; the rest are standalone splits. */
export const SPLIT_BY: { value: SplitBy; label: string; hint: string }[] = [
    ...METHODS,
    { value: 'items', label: 'By item', hint: 'Tap who had each item. Tax and tip are shared by what each person had.' },
];

const cents = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100);

export interface ExpenseSplit {
    /** Dollars owed per member id. Pennies always add up to the amount when `valid`. */
    shares: Record<string, number>;
    valid: boolean;
    /** Plain-language reason it can't be saved yet, when invalid. */
    problem: string | null;
    /** Exact mode: dollars still unassigned (negative when over-assigned). Percent mode: percent left. */
    remaining: number;
}

/**
 * Split a standalone expense. Uses integer cents and largest-remainder allocation, like receipts, so the
 * parts always sum exactly to the total.
 */
export function splitExpense(amount: number, method: SplitMethod, data: SplitData): ExpenseSplit {
    const total = cents(amount);
    const ids = Object.keys(data).sort();
    const out = (parts: number[], valid: boolean, problem: string | null, remaining = 0): ExpenseSplit => ({
        shares: Object.fromEntries(ids.map((id, i) => [id, (parts[i] ?? 0) / 100])),
        valid,
        problem,
        remaining,
    });

    if (ids.length === 0) return out([], false, 'Choose at least one person.');
    if (ids.some(id => !(data[id] >= 0))) return out(ids.map(() => 0), false, 'Values cannot be negative.');

    if (method === 'equal') return out(allocate(total, ids.map(() => 1)), true, null);

    if (method === 'exact') {
        const parts = ids.map(id => cents(data[id]));
        const left = total - parts.reduce((a, b) => a + b, 0);
        return out(parts, left === 0, left === 0 ? null : left > 0 ? `${(left / 100).toFixed(2)} still to assign.` : `${(-left / 100).toFixed(2)} over the total.`, left / 100);
    }

    const weights = ids.map(id => data[id]);
    const sum = weights.reduce((a, b) => a + b, 0);
    if (sum <= 0) return out(ids.map(() => 0), false, method === 'percent' ? 'Percentages must add up to 100.' : 'Give at least one person a share.');
    const parts = allocate(total, weights);
    if (method === 'percent') {
        const off = Math.round((100 - sum) * 100) / 100;
        return out(parts, off === 0, off === 0 ? null : off > 0 ? `${off}% still to assign.` : `${-off}% over 100.`, off);
    }
    return out(parts, true, null);
}

/** Everyone included, equally. */
export const everyoneEqual = (memberIds: string[]): SplitData => Object.fromEntries(memberIds.map(id => [id, 1]));

/** Sensible starting values when switching method, keeping who is included. */
export function convertSplit(from: SplitMethod, to: SplitMethod, data: SplitData, amount: number): SplitData {
    const ids = Object.keys(data);
    if (ids.length === 0 || to === 'equal' || to === 'shares') return Object.fromEntries(ids.map(id => [id, 1]));
    if (to === 'percent') {
        const parts = allocate(10000, ids.map(() => 1));
        return Object.fromEntries(ids.map((id, i) => [id, parts[i] / 100]));
    }
    const parts = allocate(cents(amount), ids.map(() => 1)); // exact
    return Object.fromEntries(ids.map((id, i) => [id, parts[i] / 100]));
}

export interface ExpenseLike {
    kind?: 'receipt' | 'expense';
    amount?: number | null;
    split_method?: SplitMethod | null;
    split_data?: SplitData;
    tax: number;
    tip: number;
    participants: string[];
    items: { price: number; assigned_users: string[] }[];
}

/** Total cost of a record, regardless of kind. */
export function totalOf(e: ExpenseLike): number {
    if (e.kind === 'expense') return e.amount ?? 0;
    return Math.round((e.items.reduce((a, i) => a + i.price, 0) + e.tax + e.tip) * 100) / 100;
}

/** What one member owes on a record (dollars). Receipts are matched by display name, expenses by user id. */
export function myShare(e: ExpenseLike, member: { user_id: string; name: string } | undefined): number {
    if (!member) return 0;
    if (e.kind === 'expense') return splitExpense(e.amount ?? 0, e.split_method ?? 'equal', e.split_data ?? {}).shares[member.user_id] ?? 0;
    const { totals } = computeSplit(e.items, e.participants, e.tax, e.tip);
    return totals.find(([n]) => n === member.name)?.[1] ?? 0;
}
