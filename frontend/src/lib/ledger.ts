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
    /** Dollars this person fronted for others (what they paid, minus their own share). */
    paid: number;
    /** Dollars they owe in shares of things other people paid for. */
    owes: number;
    /** Positive = owed money, negative = owes money, after payments. */
    net: number;
}
export interface Debt {
    from: string; // owes
    to: string; // is owed
    amount: number;
}
export interface GroupLedger {
    members: MemberStanding[];
    /** Who owes whom, pair by pair (the same numbers Friends shows), largest first. */
    debts: Debt[];
}

/**
 * The whole group's books. For every record the payer fronted the money and each other member owes their share to
 * the payer; recorded payments reduce those debts. Net positions always sum to zero.
 */
export function groupLedger(group: LedgerGroup, records: LedgerRecord[], settlements: LedgerSettlement[]): GroupLedger {
    const owe = new Map<string, number>(); // `${debtor}|${creditor}` -> cents
    const bump = (debtor: string, creditor: string, c: number) => owe.set(`${debtor}|${creditor}`, (owe.get(`${debtor}|${creditor}`) ?? 0) + c);
    const ids = new Set(group.members.map(m => m.user_id));
    const byName = new Map<string, string | null>();
    for (const m of group.members) byName.set(m.name, byName.has(m.name) ? null : m.user_id);

    for (const r of records) {
        if (r.group_id !== group.id) continue;
        const payer = r.paid_by ?? r.user_id;
        if (!payer || !ids.has(payer)) continue;
        const shares: [string | null | undefined, number][] =
            r.kind === 'expense'
                ? Object.entries(splitExpense(r.amount ?? 0, r.split_method ?? 'equal', r.split_data ?? {}).shares).filter(([id]) => ids.has(id))
                : computeSplit(r.items, r.participants, r.tax, r.tip).totals.map(([name, amt]) => [byName.get(name), amt] as [string | null | undefined, number]);
        for (const [debtor, amt] of shares) {
            if (!debtor || debtor === payer || amt <= 0) continue;
            bump(debtor, payer, Math.round(amt * 100));
        }
    }
    for (const p of settlements) {
        if (p.group_id !== group.id) continue;
        bump(p.from_user, p.to_user, -Math.round(p.amount * 100)); // the payer of a settlement owes less
    }

    const debts: Debt[] = [];
    const net = new Map<string, number>();
    const paid = new Map<string, number>();
    const owes = new Map<string, number>();
    const seen = new Set<string>();
    for (const key of owe.keys()) {
        const [x, y] = key.split('|');
        const pair = [x, y].sort().join('|');
        if (seen.has(pair)) continue;
        seen.add(pair);
        const d = (owe.get(`${x}|${y}`) ?? 0) - (owe.get(`${y}|${x}`) ?? 0);
        if (d === 0) continue;
        const [debtor, creditor] = d > 0 ? [x, y] : [y, x];
        const c = Math.abs(d);
        debts.push({ from: debtor, to: creditor, amount: c / 100 });
        net.set(creditor, (net.get(creditor) ?? 0) + c);
        net.set(debtor, (net.get(debtor) ?? 0) - c);
        paid.set(creditor, (paid.get(creditor) ?? 0) + c);
        owes.set(debtor, (owes.get(debtor) ?? 0) + c);
    }
    debts.sort((a, b) => b.amount - a.amount || a.from.localeCompare(b.from));

    const members = group.members
        .map(m => ({ userId: m.user_id, paid: (paid.get(m.user_id) ?? 0) / 100, owes: (owes.get(m.user_id) ?? 0) / 100, net: (net.get(m.user_id) ?? 0) / 100 }))
        .sort((a, b) => b.net - a.net);
    return { members, debts };
}
