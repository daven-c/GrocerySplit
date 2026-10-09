import { computeSplit } from './calc';
import { splitExpense, SplitData, SplitMethod } from './expenses';

export interface LedgerGroup {
    id: string;
    members: { user_id: string; name: string }[];
}
export interface LedgerRecord {
    group_id: string;
    user_id?: string | null;
    paid_by: string | null;
    kind?: 'receipt' | 'expense';
    amount?: number | null;
    split_method?: SplitMethod | null;
    split_data?: SplitData;
    tax: number;
    tip: number;
    participants: string[];
    items: { price: number; assigned_users: string[] }[];
}
export interface LedgerSettlement {
    group_id: string;
    from_user: string;
    to_user: string;
    amount: number;
}

export interface MemberStanding {
    userId: string;
    /** Dollars: positive = up (is owed), negative = down (owes), after recorded transfers. */
    net: number;
}
export interface Transfer {
    from: string; // pays
    to: string; // receives
    amount: number;
}
export interface GroupLedger {
    /** Everyone's position, biggest first. Always sums to zero. */
    members: MemberStanding[];
    /** A short list of transfers that would settle everyone (at most one fewer than the number of people). */
    transfers: Transfer[];
}

/**
 * The whole group's books. For every record the payer fronted the money and each other member owes their share to
 * the payer; a recorded transfer moves money from the person who paid to the person who received it. Each person's
 * net position is what they are owed minus what they owe. Net positions always sum to zero.
 */
export function groupLedger(group: LedgerGroup, records: LedgerRecord[], settlements: LedgerSettlement[]): GroupLedger {
    const net = new Map<string, number>(group.members.map(m => [m.user_id, 0])); // cents
    const ids = new Set(group.members.map(m => m.user_id));
    const move = (id: string, c: number) => net.set(id, (net.get(id) ?? 0) + c);

    for (const r of records) {
        if (r.group_id !== group.id) continue;
        const payer = r.paid_by ?? r.user_id;
        if (!payer || !ids.has(payer)) continue;
        const shares: [string | null | undefined, number][] =
            r.kind === 'expense'
                ? Object.entries(splitExpense(r.amount ?? 0, r.split_method ?? 'equal', r.split_data ?? {}).shares).filter(([id]) => ids.has(id))
                : // Receipts name people by id too, so two people with the same display name stay apart. Someone who has
                  // left the group can't be settled with, so they are not charged.
                  computeSplit(r.items, r.participants, r.tax, r.tip).totals.filter(([id]) => ids.has(id));
        for (const [debtor, amt] of shares) {
            if (!debtor || debtor === payer || amt <= 0) continue;
            const c = Math.round(amt * 100);
            move(payer, c); // fronted it
            move(debtor, -c); // owes it
        }
    }
    for (const p of settlements) {
        if (p.group_id !== group.id || !ids.has(p.from_user) || !ids.has(p.to_user)) continue;
        const c = Math.round(p.amount * 100);
        move(p.from_user, c); // paying someone back brings you up
        move(p.to_user, -c); // and takes them down
    }

    // Greedy: the biggest debtor pays the biggest creditor, repeat. Never more than (people - 1) payments.
    const creditors = [...net].filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]).map(([id, c]) => ({ id, c }));
    const debtors = [...net].filter(([, c]) => c < 0).sort((a, b) => a[1] - b[1]).map(([id, c]) => ({ id, c: -c }));
    const transfers: Transfer[] = [];
    let i = 0, j = 0;
    while (i < creditors.length && j < debtors.length) {
        const c = Math.min(creditors[i].c, debtors[j].c);
        transfers.push({ from: debtors[j].id, to: creditors[i].id, amount: c / 100 });
        creditors[i].c -= c;
        debtors[j].c -= c;
        if (creditors[i].c === 0) i++;
        if (debtors[j].c === 0) j++;
    }

    const members = group.members.map(m => ({ userId: m.user_id, net: (net.get(m.user_id) ?? 0) / 100 })).sort((a, b) => b.net - a.net);
    return { members, transfers };
}
