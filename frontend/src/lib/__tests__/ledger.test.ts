import { describe, it, expect } from 'vitest';
import { groupLedger, LedgerRecord } from '../ledger';

const group = { id: 'g1', members: [{ user_id: 'me', name: 'Me' }, { user_id: 'amy', name: 'Amy' }, { user_id: 'bo', name: 'Bo' }] };
const expense = (over: Partial<LedgerRecord> = {}): LedgerRecord => ({
    kind: 'expense', group_id: 'g1', paid_by: 'me', amount: 90, split_method: 'equal', split_data: { me: 1, amy: 1, bo: 1 },
    tax: 0, tip: 0, participants: [], items: [], ...over,
});
const net = (l: ReturnType<typeof groupLedger>, id: string) => l.members.find(m => m.userId === id)!.net;
const total = (l: ReturnType<typeof groupLedger>) => Math.round(l.members.reduce((a, m) => a + m.net, 0) * 100);
const pay = (from: string, to: string, amount: number) => ({ group_id: 'g1', from_user: from, to_user: to, amount });

describe('groupLedger: who is up or down', () => {
    it('the payer is up by everyone else\'s share; positions always sum to zero', () => {
        const l = groupLedger(group, [expense()], []);
        expect(net(l, 'me')).toBe(60);
        expect(net(l, 'amy')).toBe(-30);
        expect(net(l, 'bo')).toBe(-30);
        expect(total(l)).toBe(0);
    });
    it('biggest first', () => {
        expect(groupLedger(group, [expense()], []).members.map(m => m.userId)[0]).toBe('me');
    });
    it('an expense paid by someone else and shared only with them changes nothing', () => {
        const l = groupLedger(group, [expense({ paid_by: 'amy', split_data: { amy: 1 }, amount: 20 })], []);
        expect(l.members.every(m => m.net === 0)).toBe(true);
        expect(l.transfers).toEqual([]);
    });
    it('direction follows who paid', () => {
        const l = groupLedger(group, [expense({ paid_by: 'amy', split_data: { me: 1, amy: 1 }, amount: 40 })], []);
        expect(net(l, 'amy')).toBe(20);
        expect(net(l, 'me')).toBe(-20);
    });
    it('transfers bring the payer up and the receiver down, and later expenses still count', () => {
        const base = [expense({ amount: 60, split_data: { me: 1, amy: 1 } })]; // amy is down 30
        const paid = groupLedger(group, base, [pay('amy', 'me', 30)]);
        expect(paid.members.every(m => m.net === 0)).toBe(true);
        const later = groupLedger(group, [...base, expense({ amount: 40, split_data: { me: 1, amy: 1 } })], [pay('amy', 'me', 30)]);
        expect(net(later, 'amy')).toBe(-20);
        expect(total(later)).toBe(0);
    });
    it('a transfer between two people who are not the payer works too (any member can record it)', () => {
        const l = groupLedger(group, [expense()], [pay('bo', 'me', 30), pay('amy', 'me', 10)]);
        expect(net(l, 'bo')).toBe(0);
        expect(net(l, 'amy')).toBe(-20);
        expect(net(l, 'me')).toBe(20);
    });
    it('overpaying flips the position', () => {
        const l = groupLedger(group, [expense({ amount: 60, split_data: { me: 1, amy: 1 } })], [pay('amy', 'me', 50)]);
        expect(net(l, 'amy')).toBe(20);
        expect(net(l, 'me')).toBe(-20);
    });
    it('receipts: matched by name, tax shared by what was bought; unassigned items change nothing', () => {
        const receipt: LedgerRecord = {
            group_id: 'g1', paid_by: 'amy', tax: 2, tip: 0, participants: ['Me', 'Amy', 'Bo'],
            items: [{ price: 10, assigned_users: ['Me'] }, { price: 10, assigned_users: ['Amy'] }, { price: 99, assigned_users: [] }],
        };
        const l = groupLedger(group, [receipt], []);
        expect(net(l, 'me')).toBe(-11); // 10 + half of 2 tax
        expect(net(l, 'amy')).toBe(11);
        expect(groupLedger(group, [{ ...receipt, items: [{ price: 10, assigned_users: [] }] }], []).members.every(m => m.net === 0)).toBe(true);
    });
    it('ignores people who are not (or no longer) members, and other groups', () => {
        const l = groupLedger(group, [expense({ split_data: { me: 1, amy: 1, gone: 1 } }), expense({ group_id: 'other' })], [{ group_id: 'other', from_user: 'amy', to_user: 'me', amount: 5 }, pay('gone', 'me', 7)]);
        expect(net(l, 'amy')).toBe(-30);
        expect(total(l)).toBe(0);
    });
    it('keeps pennies exact', () => {
        const l = groupLedger(group, [expense({ amount: 100 })], []);
        expect(total(l)).toBe(0);
        expect(Math.round(net(l, 'me') * 100)).toBe(6667);
    });
    it('no records: everyone square', () => {
        const l = groupLedger(group, [], []);
        expect(l.members.map(m => m.net)).toEqual([0, 0, 0]);
        expect(l.transfers).toEqual([]);
    });
});

describe('groupLedger: suggested transfers', () => {
    it('one person fronted for two: two transfers to them', () => {
        expect(groupLedger(group, [expense()], []).transfers).toEqual([{ from: 'amy', to: 'me', amount: 30 }, { from: 'bo', to: 'me', amount: 30 }]);
    });
    it('chains collapse: if Amy owes Bo and Bo owes Me, Amy just pays Me', () => {
        const l = groupLedger(group, [
            expense({ paid_by: 'bo', amount: 20, split_data: { bo: 1, amy: 1 } }), // amy down 10, bo up 10
            expense({ paid_by: 'me', amount: 20, split_data: { me: 1, bo: 1 } }), // bo down 10, me up 10
        ], []);
        expect(l.transfers).toEqual([{ from: 'amy', to: 'me', amount: 10 }]); // 1 payment instead of 2
    });
    it('never needs more than (people - 1) transfers, and applying them settles everyone exactly', () => {
        const members = ['a', 'b', 'c', 'd', 'e'].map(id => ({ user_id: id, name: id.toUpperCase() }));
        const g = { id: 'g1', members };
        const records: LedgerRecord[] = [
            expense({ paid_by: 'a', amount: 100, split_data: { a: 1, b: 1, c: 1, d: 1, e: 1 } }),
            expense({ paid_by: 'b', amount: 33.33, split_data: { a: 1, b: 1, c: 1 } }),
            expense({ paid_by: 'c', amount: 12.5, split_data: { c: 1, d: 1, e: 1 } }),
            expense({ paid_by: 'e', amount: 80, split_data: { a: 3, e: 1 }, split_method: 'shares' }),
        ];
        const l = groupLedger(g, records, []);
        expect(l.transfers.length).toBeLessThanOrEqual(members.length - 1);
        const after = groupLedger(g, records, l.transfers.map(t => pay(t.from, t.to, t.amount)));
        expect(after.members.every(m => m.net === 0)).toBe(true);
        expect(after.transfers).toEqual([]);
    });
    it('shrinks as transfers are recorded', () => {
        const first = groupLedger(group, [expense()], []);
        const t = first.transfers[0];
        const next = groupLedger(group, [expense()], [pay(t.from, t.to, t.amount)]);
        expect(next.transfers).toHaveLength(first.transfers.length - 1);
    });
});
