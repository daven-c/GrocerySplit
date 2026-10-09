import { computeSplit } from './calc';
import { splitExpense, SplitData, SplitMethod } from './expenses';

export interface BalanceGroup {
    id: string;
    members: { user_id: string; name: string }[];
}
export interface BalanceSession {
    kind?: 'receipt' | 'expense';
    amount?: number | null;
    split_method?: SplitMethod | null;
    split_data?: SplitData;
    group_id: string;
    user_id?: string | null;
    paid_by: string | null;
    tax: number;
    tip: number;
    participants: string[];
    items: { price: number; assigned_users: string[] }[];
}
export interface BalanceSettlement {
    group_id: string;
    from_user: string;
    to_user: string;
    amount: number;
}

export interface Balances {
    /** Per friend: net dollars across all groups. Positive = they owe you, negative = you owe them. */
    friends: Record<string, { net: number; byGroup: Record<string, number> }>;
    /** Per group: your net with everyone in it, same sign convention. */
    byGroup: Record<string, number>;
}

const toDollars = (c: number) => c / 100;

/**
 * Receipts say who paid (`paid_by`) and how each participant's share works out; everyone else on
 * the receipt owes the payer their share. Recorded settlements then offset those debts.
 * Receipts and standalone expenses both name people by id (members and temporary people alike), so two people who
 * share a display name stay apart. Someone who has left the group can't be settled with, so they are not charged.
 */
export function computeBalances(me: string, groups: BalanceGroup[], sessions: BalanceSession[], settlements: BalanceSettlement[]): Balances {
    const cents: Record<string, Record<string, number>> = {}; // friend -> group -> cents
    const add = (friend: string, group: string, c: number) => {
        ((cents[friend] ??= {})[group] ??= 0);
        cents[friend][group] += c;
    };

    const memberIds = new Map<string, Set<string>>();
    for (const g of groups) memberIds.set(g.id, new Set(g.members.map(m => m.user_id)));

    for (const s of sessions) {
        const payer = s.paid_by ?? s.user_id;
        const members = memberIds.get(s.group_id);
        if (!payer || !members) continue;
        const owed: [string | null | undefined, number][] =
            s.kind === 'expense'
                ? Object.entries(splitExpense(s.amount ?? 0, s.split_method ?? 'equal', s.split_data ?? {}).shares).filter(([id]) => members.has(id))
                : computeSplit(s.items, s.participants, s.tax, s.tip).totals.filter(([id]) => members.has(id));
        for (const [debtor, amount] of owed) {
            if (!debtor || debtor === payer || amount <= 0) continue;
            const c = Math.round(amount * 100);
            if (payer === me) add(debtor, s.group_id, c); // they owe me
            else if (debtor === me) add(payer, s.group_id, -c); // I owe them
        }
    }

    for (const p of settlements) {
        const c = Math.round(p.amount * 100);
        if (p.from_user === me) add(p.to_user, p.group_id, c); // I paid them
        else if (p.to_user === me) add(p.from_user, p.group_id, -c); // they paid me
    }

    const friends: Balances['friends'] = {};
    const byGroup: Balances['byGroup'] = {};
    for (const [friend, perGroup] of Object.entries(cents)) {
        let net = 0;
        const bg: Record<string, number> = {};
        for (const [g, c] of Object.entries(perGroup)) {
            bg[g] = toDollars(c);
            net += c;
            byGroup[g] = toDollars(Math.round(((byGroup[g] ?? 0) * 100) + c));
        }
        friends[friend] = { net: toDollars(net), byGroup: bg };
    }
    return { friends, byGroup };
}
