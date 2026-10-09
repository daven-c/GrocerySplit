import { describe, it, expect } from 'vitest';
import { computeBalances, BalanceSession } from '../balances';

const group = { id: 'g1', members: [{ user_id: 'me', name: 'Me' }, { user_id: 'amy', name: 'Amy' }, { user_id: 'bo', name: 'Bo' }] };
const receipt = (over: Partial<BalanceSession> = {}): BalanceSession => ({
    group_id: 'g1', paid_by: 'me', tax: 0, tip: 0, participants: ['me', 'amy'],
    items: [{ price: 10, assigned_users: ['me', 'amy'] }], ...over,
});

describe('computeBalances', () => {
    it('others owe the payer their share', () => {
        const b = computeBalances('me', [group], [receipt()], []);
        expect(b.friends.amy.net).toBe(5);
        expect(b.byGroup.g1).toBe(5);
    });
    it('you owe the payer when someone else paid', () => {
        const b = computeBalances('me', [group], [receipt({ paid_by: 'amy' })], []);
        expect(b.friends.amy.net).toBe(-5);
    });
    it('includes tax and tip in each share', () => {
        const b = computeBalances('me', [group], [receipt({ tax: 1, tip: 1 })], []);
        expect(b.friends.amy.net).toBe(6);
    });
    it('nets receipts in opposite directions and across groups', () => {
        const g2 = { id: 'g2', members: [{ user_id: 'me', name: 'Me' }, { user_id: 'amy', name: 'Amy' }] };
        const b = computeBalances('me', [group, g2], [
            receipt(), // amy owes me 5
            receipt({ paid_by: 'amy', items: [{ price: 4, assigned_users: ['me', 'amy'] }] }), // I owe amy 2
            receipt({ group_id: 'g2', items: [{ price: 20, assigned_users: ['me', 'amy'] }] }), // amy owes me 10
        ], []);
        expect(b.friends.amy.net).toBe(13);
        expect(b.friends.amy.byGroup).toEqual({ g1: 3, g2: 10 });
    });
    it('settlements offset debts in both directions', () => {
        const owedToMe = computeBalances('me', [group], [receipt()], [{ group_id: 'g1', from_user: 'amy', to_user: 'me', amount: 5 }]);
        expect(owedToMe.friends.amy.net).toBe(0);
        const iOwe = computeBalances('me', [group], [receipt({ paid_by: 'amy' })], [{ group_id: 'g1', from_user: 'me', to_user: 'amy', amount: 2 }]);
        expect(iOwe.friends.amy.net).toBe(-3);
    });
    it('ignores debts between two other people', () => {
        const b = computeBalances('me', [group], [receipt({ paid_by: 'bo', participants: ['amy', 'bo'], items: [{ price: 10, assigned_users: ['amy', 'bo'] }] })], []);
        expect(b.friends).toEqual({});
    });
    it('ignores people who are not in the group and items nobody had', () => {
        const stranger = receipt({ participants: ['me', 'stranger'], items: [{ price: 10, assigned_users: ['me', 'stranger'] }] });
        expect(computeBalances('me', [group], [stranger], []).friends).toEqual({});
        expect(computeBalances('me', [group], [receipt({ items: [{ price: 10, assigned_users: [] }] })], []).friends).toEqual({});
    });
    it('keeps two people with the same display name apart', () => {
        const dup = { id: 'g1', members: [...group.members, { user_id: 'amy2', name: 'Amy' }] };
        const b = computeBalances('me', [dup], [receipt({ participants: ['me', 'amy', 'amy2'], items: [{ price: 12, assigned_users: ['me', 'amy', 'amy2'] }] })], []);
        expect(b.friends.amy.net).toBe(4);
        expect(b.friends.amy2.net).toBe(4);
        expect(b.byGroup.g1).toBe(8);
    });
    it('a temporary person (a guest id) is charged like anyone else, and someone who left is not', () => {
        const withGuest = { id: 'g1', members: [...group.members, { user_id: 'guest-1', name: 'Cy' }] };
        const r = receipt({ participants: ['me', 'guest-1', 'gone'], items: [{ price: 10, assigned_users: ['me', 'guest-1', 'gone'] }] });
        const b = computeBalances('me', [withGuest], [r], []);
        expect(b.friends['guest-1'].net).toBeCloseTo(3.33, 2);
        expect(b.friends.gone).toBeUndefined();
    });
    it('falls back to the creator when paid_by is missing', () => {
        const b = computeBalances('me', [group], [receipt({ paid_by: null, user_id: 'me' })], []);
        expect(b.friends.amy.net).toBe(5);
    });
    it('keeps cents exact with odd splits', () => {
        const b = computeBalances('me', [group], [receipt({ participants: ['me', 'amy', 'bo'], items: [{ price: 10, assigned_users: ['me', 'amy', 'bo'] }] })], []);
        expect(Math.round((b.friends.amy.net + b.friends.bo.net) * 100)).toBe(667);
    });

    describe('standalone expenses', () => {
        const expense = (over: Partial<BalanceSession> = {}): BalanceSession => ({
            kind: 'expense', group_id: 'g1', paid_by: 'me', amount: 100, split_method: 'equal',
            split_data: { me: 1, amy: 1 }, tax: 0, tip: 0, participants: [], items: [], ...over,
        });
        it('others owe the payer their share, matched by member id', () => {
            expect(computeBalances('me', [group], [expense()], []).friends.amy.net).toBe(50);
        });
        it('exact, percent and shares splits drive what is owed', () => {
            expect(computeBalances('me', [group], [expense({ split_method: 'exact', split_data: { me: 70, amy: 30 } })], []).friends.amy.net).toBe(30);
            expect(computeBalances('me', [group], [expense({ split_method: 'percent', split_data: { me: 25, amy: 75 } })], []).friends.amy.net).toBe(75);
            expect(computeBalances('me', [group], [expense({ split_method: 'shares', split_data: { me: 1, amy: 3 } })], []).friends.amy.net).toBe(75);
        });
        it('you owe the payer when someone else paid, and non-participants owe nothing', () => {
            expect(computeBalances('me', [group], [expense({ paid_by: 'amy' })], []).friends.amy.net).toBe(-50);
            expect(computeBalances('me', [group], [expense({ split_data: { me: 1, bo: 1 } })], []).friends.amy).toBeUndefined();
        });
        it('is immune to duplicate display names, unlike receipts', () => {
            const dup = { id: 'g1', members: [...group.members, { user_id: 'amy2', name: 'Amy' }] };
            const b = computeBalances('me', [dup], [expense({ split_data: { me: 1, amy: 1, amy2: 1 } })], []);
            // Both Amys are charged separately (a receipt would have ignored them); pennies still add up.
            expect(Math.round((b.friends.amy.net + b.friends.amy2.net) * 100)).toBe(6667);
            expect(b.friends.amy.net).toBeGreaterThan(33);
            expect(b.friends.amy2.net).toBeGreaterThan(33);
        });
        it('does not charge someone who has left the group', () => {
            const b = computeBalances('me', [group], [expense({ split_data: { me: 1, amy: 1, gone: 1 } })], []);
            expect(b.friends.amy.net).toBeCloseTo(33.34, 2); // still split three ways, but no debt to a departed member
            expect(Object.keys(b.friends)).toEqual(['amy']);
        });
        it('mixes with receipts and settlements', () => {
            const b = computeBalances('me', [group], [expense(), receipt()], [{ group_id: 'g1', from_user: 'amy', to_user: 'me', amount: 20 }]);
            expect(b.friends.amy.net).toBe(50 + 5 - 20);
        });
    });
});
