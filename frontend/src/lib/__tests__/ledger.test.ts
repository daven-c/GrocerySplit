import { describe, it, expect } from 'vitest';
import { groupLedger, LedgerRecord } from '../ledger';

const group = { id: 'g1', members: [{ user_id: 'me', name: 'Me' }, { user_id: 'amy', name: 'Amy' }, { user_id: 'bo', name: 'Bo' }] };
const expense = (over: Partial<LedgerRecord> = {}): LedgerRecord => ({
    kind: 'expense', group_id: 'g1', paid_by: 'me', amount: 90, split_method: 'equal', split_data: { me: 1, amy: 1, bo: 1 },
    tax: 0, tip: 0, participants: [], items: [], ...over,
});
const standing = (l: ReturnType<typeof groupLedger>, id: string) => l.members.find(m => m.userId === id)!;
const total = (l: ReturnType<typeof groupLedger>) => Math.round(l.members.reduce((a, m) => a + m.net, 0) * 100);

describe('groupLedger', () => {
    it('payer is owed everyone else\'s share; positions always sum to zero', () => {
        const l = groupLedger(group, [expense()], []);
        expect(standing(l, 'me').net).toBe(60);
        expect(standing(l, 'amy').net).toBe(-30);
        expect(standing(l, 'bo').net).toBe(-30);
        expect(total(l)).toBe(0);
        expect(l.debts).toEqual([{ from: 'amy', to: 'me', amount: 30 }, { from: 'bo', to: 'me', amount: 30 }]);
    });
    it('an expense paid by someone else and shared only with them charges nobody', () => {
        const l = groupLedger(group, [expense({ paid_by: 'amy', split_data: { amy: 1 }, amount: 20 })], []);
        expect(l.debts).toEqual([]);
        expect(l.members.every(m => m.net === 0)).toBe(true);
    });
    it('direction follows who paid', () => {
        const l = groupLedger(group, [expense({ paid_by: 'amy', split_data: { me: 1, amy: 1 }, amount: 40 })], []);
        expect(l.debts).toEqual([{ from: 'me', to: 'amy', amount: 20 }]);
    });
    it('pair by pair, opposite debts net against each other', () => {
        const l = groupLedger(group, [
            expense({ amount: 60, split_data: { me: 1, amy: 1 } }), // amy owes me 30
            expense({ paid_by: 'amy', amount: 20, split_data: { me: 1, amy: 1 } }), // me owes amy 10
        ], []);
        expect(l.debts).toEqual([{ from: 'amy', to: 'me', amount: 20 }]);
        expect(standing(l, 'me').net).toBe(20);
    });
    it('payments reduce debts, and new expenses after paying back still count', () => {
        const pay = [{ group_id: 'g1', from_user: 'amy', to_user: 'me', amount: 30 }];
        const settled = groupLedger(group, [expense({ amount: 60, split_data: { me: 1, amy: 1 } })], pay);
        expect(settled.debts).toEqual([]);
        const later = groupLedger(group, [expense({ amount: 60, split_data: { me: 1, amy: 1 } }), expense({ amount: 40, split_data: { me: 1, amy: 1 } })], pay);
        expect(later.debts).toEqual([{ from: 'amy', to: 'me', amount: 20 }]);
        expect(total(later)).toBe(0);
    });
    it('overpaying flips the debt', () => {
        const l = groupLedger(group, [expense({ amount: 60, split_data: { me: 1, amy: 1 } })], [{ group_id: 'g1', from_user: 'amy', to_user: 'me', amount: 50 }]);
        expect(l.debts).toEqual([{ from: 'me', to: 'amy', amount: 20 }]);
    });
    it('receipts: matched by name, with tax shared by what was bought; unassigned items charge nobody', () => {
        const receipt: LedgerRecord = {
            group_id: 'g1', paid_by: 'amy', tax: 2, tip: 0, participants: ['Me', 'Amy', 'Bo'],
            items: [{ price: 10, assigned_users: ['Me'] }, { price: 10, assigned_users: ['Amy'] }, { price: 99, assigned_users: [] }],
        };
        const l = groupLedger(group, [receipt], []);
        expect(l.debts).toEqual([{ from: 'me', to: 'amy', amount: 11 }]); // 10 + half of 2 tax
        expect(total(l)).toBe(0);
        const unassigned = groupLedger(group, [{ ...receipt, items: [{ price: 10, assigned_users: [] }] }], []);
        expect(unassigned.debts).toEqual([]);
    });
    it('ignores people who are not (or no longer) members, and other groups', () => {
        const l = groupLedger(group, [expense({ split_data: { me: 1, amy: 1, gone: 1 } }), expense({ group_id: 'other' })], [{ group_id: 'other', from_user: 'amy', to_user: 'me', amount: 5 }]);
        expect(l.debts.map(d => d.from)).toEqual(['amy']);
        expect(total(l)).toBe(0);
    });
    it('keeps pennies exact', () => {
        const l = groupLedger(group, [expense({ amount: 100 })], []);
        expect(l.debts.reduce((a, d) => a + Math.round(d.amount * 100), 0)).toBe(6667); // me fronted 66.67 for the other two
        expect(total(l)).toBe(0);
    });
    it('everyone square with no records', () => {
        const l = groupLedger(group, [], []);
        expect(l.debts).toEqual([]);
        expect(l.members.map(m => m.net)).toEqual([0, 0, 0]);
    });
});
