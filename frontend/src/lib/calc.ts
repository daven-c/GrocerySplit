export interface SplitItem {
    price: number;
    assigned_users: string[];
}

export interface SplitResult {
    /** Per-person totals in dollars (subtotal share + tax share + tip share), sorted high to low. */
    totals: [string, number][];
    /** Sum of items assigned to at least one participant. */
    assignedSubtotal: number;
    /** Sum of items nobody is paying for yet. */
    unassignedSubtotal: number;
}

const toCents = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100);

/**
 * Spread `cents` over `weights` proportionally using largest-remainder, so the
 * parts always sum to exactly `cents` (no lost or invented pennies).
 */
export function allocate(cents: number, weights: number[]): number[] {
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    if (weights.length === 0) return [];
    if (totalWeight <= 0) return allocate(cents, weights.map(() => 1));
    const exact = weights.map(w => (cents * w) / totalWeight);
    const parts = exact.map(Math.floor);
    let remainder = cents - parts.reduce((a, b) => a + b, 0);
    const order = exact
        .map((e, i) => ({ i, frac: e - Math.floor(e) }))
        .sort((a, b) => b.frac - a.frac || a.i - b.i);
    for (let k = 0; remainder > 0; k = (k + 1) % order.length, remainder--) parts[order[k].i]++;
    return parts;
}

export function computeSplit(items: SplitItem[], participants: string[], tax: number, tip: number): SplitResult {
    const people = [...new Set(participants)].sort((a, b) => a.localeCompare(b));
    // Each person's exact (fractional) share of the items, in cents. Rounding happens once, at the very end:
    // rounding item by item would hand the same person the odd cent of every shared item and add up to a visible gap.
    const exact: Record<string, number> = Object.fromEntries(people.map(p => [p, 0]));
    let assigned = 0;
    let unassigned = 0;

    for (const item of items) {
        const price = toCents(item.price);
        const payers = [...new Set(item.assigned_users)].filter(u => u in exact);
        if (payers.length === 0) {
            unassigned += price;
            continue;
        }
        assigned += price;
        for (const p of payers) exact[p] += price / payers.length;
    }

    // Tax and tip are shared in proportion to what each person's items cost, so each person's exact total is
    // their items scaled up by (items + tax + tip) / items. If nobody has claimed an item yet there is nothing to
    // base a share on, so nobody is charged (splitting it evenly would make people owe money on a receipt that
    // isn't theirs). Largest-remainder rounding keeps the parts summing exactly to the total.
    let parts = people.map(() => 0);
    if (assigned > 0) {
        parts = allocate(assigned + toCents(tax) + toCents(tip), people.map(p => exact[p]));
    }
    const cents: Record<string, number> = Object.fromEntries(people.map((p, i) => [p, parts[i]]));

    const totals = people.map(p => [p, cents[p] / 100] as [string, number]).sort((a, b) => b[1] - a[1]);
    return { totals, assignedSubtotal: assigned / 100, unassignedSubtotal: unassigned / 100 };
}
