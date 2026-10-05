import { describe, it, expect } from 'vitest';
import { computeBalances, BalanceSession } from '../balances';

const group = { id: 'g1', members: [{ user_id: 'me', name: 'Me' }, { user_id: 'amy', name: 'Amy' }, { user_id: 'bo', name: 'Bo' }] };
const receipt = (over: Partial<BalanceSession> = {}): BalanceSession => ({
    group_id: 'g1', paid_by: 'me', tax: 0, tip: 0, participants: ['Me', 'Amy'],
    items: [{ price: 10, assigned_users: ['Me', 'Amy'] }], ...over,
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
            receipt({ paid_by: 'amy', items: [{ price: 4, assigned_users: ['Me', 'Amy'] }] }), // I owe amy 2
            receipt({ group_id: 'g2', items: [{ price: 20, assigned_users: ['Me', 'Amy'] }] }), // amy owes me 10
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
        const b = computeBalances('me', [group], [receipt({ paid_by: 'bo', participants: ['Amy', 'Bo'], items: [{ price: 10, assigned_users: ['Amy', 'Bo'] }] })], []);
        expect(b.friends).toEqual({});
    });
    it('ignores guests, unassigned items and ambiguous duplicate names', () => {
        const dup = { id: 'g1', members: [...group.members, { user_id: 'amy2', name: 'Amy' }] };
        expect(computeBalances('me', [dup], [receipt()], []).friends).toEqual({});
        const guest = receipt({ participants: ['Me', 'Guest'], items: [{ price: 10, assigned_users: ['Me', 'Guest'] }] });
        expect(computeBalances('me', [group], [guest], []).friends).toEqual({});
        expect(computeBalances('me', [group], [receipt({ items: [{ price: 10, assigned_users: [] }] })], []).friends).toEqual({});
    });
    it('falls back to the creator when paid_by is missing', () => {
        const b = computeBalances('me', [group], [receipt({ paid_by: null, user_id: 'me' })], []);
        expect(b.friends.amy.net).toBe(5);
    });
    it('keeps cents exact with odd splits', () => {
        const b = computeBalances('me', [group], [receipt({ participants: ['Me', 'Amy', 'Bo'], items: [{ price: 10, assigned_users: ['Me', 'Amy', 'Bo'] }] })], []);
        expect(Math.round((b.friends.amy.net + b.friends.bo.net) * 100)).toBe(667);
    });
});
