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
    const cents: Record<string, number> = Object.fromEntries(people.map(p => [p, 0]));
    let assigned = 0;
    let unassigned = 0;

    for (const item of items) {
        const price = toCents(item.price);
        const payers = [...new Set(item.assigned_users)].filter(u => u in cents).sort((a, b) => a.localeCompare(b));
        if (payers.length === 0) {
            unassigned += price;
            continue;
        }
        assigned += price;
        allocate(price, payers.map(() => 1)).forEach((c, i) => (cents[payers[i]] += c));
    }

    // Tax and tip are shared in proportion to what each person's items cost. If nobody has claimed an item
    // yet there is nothing to base a share on, so nobody is charged (splitting it evenly would make people owe
    // money on a receipt that isn't theirs).
    if (people.length > 0 && people.some(p => cents[p] > 0)) {
        const weights = people.map(p => cents[p]);
        for (const extra of [toCents(tax), toCents(tip)]) {
            allocate(extra, weights).forEach((c, i) => (cents[people[i]] += c));
        }
    }

    const totals = people.map(p => [p, cents[p] / 100] as [string, number]).sort((a, b) => b[1] - a[1]);
    return { totals, assignedSubtotal: assigned / 100, unassignedSubtotal: unassigned / 100 };
}
