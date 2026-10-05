// Real-database scenario test of what users actually do. Opt in: npm run test:integration (needs TEST_PASSWORD
// and confirmed users gs-test-a@ / -b@mailinator.com).
import { describe, it, expect } from 'vitest';
import { supabase } from '../supabase';
import * as api from '../api';
import { computeBalances } from '../balances';
import { everyoneEqual } from '../expenses';

const run = process.env.INTEGRATION ? describe : describe.skip;
const password = process.env.TEST_PASSWORD as string;
const sessions: Record<string, { access_token: string; refresh_token: string }> = {};
async function as(u: 'a' | 'b') {
    const c = sessions[u];
    if (c && !(await supabase.auth.setSession(c)).error) return;
    await supabase.auth.signOut({ scope: 'local' });
    const { data, error } = await supabase.auth.signInWithPassword({ email: `gs-test-${u}@mailinator.com`, password });
    expect(error).toBeNull();
    sessions[u] = { access_token: data.session!.access_token, refresh_token: data.session!.refresh_token };
}

/** Balances as the signed-in user sees them, using exactly what the app loads. */
async function seen(groupId: string) {
    const me = (await supabase.auth.getUser()).data.user!.id;
    const g = await api.getGroup(groupId);
    const [sess, settle] = [await api.listSessions(groupId), await api.listSettlements()];
    return { me, g, bal: computeBalances(me, [g], sess, settle), friend: (id: string) => computeBalances(me, [g], sess, settle).friends[id]?.net ?? 0 };
}

run('what users do: expenses, paying back, and more expenses', () => {
    let groupId = '', a = '', b = '';

    it('setup: A and B share a group', async () => {
        await as('a');
        a = (await supabase.auth.getUser()).data.user!.id;
        groupId = await api.createGroup('Scenario');
        await api.inviteToGroup(groupId, 'gs-test-b@mailinator.com');
        await as('b');
        b = (await supabase.auth.getUser()).data.user!.id;
        const [inv] = await api.myInvites();
        await api.respondToInvite(inv.id, true);
    });

    it('A pays for a shared expense; B owes half', async () => {
        await as('a');
        await api.createSession({ groupId, kind: 'expense', name: 'Groceries run', category: 'groceries', amount: 100, splitMethod: 'equal', splitData: everyoneEqual([a, b]) });
        expect((await seen(groupId)).friend(b)).toBe(50);
    });

    it('after B pays back, later expenses still count (both directions, both kinds)', async () => {
        await as('a');
        let s = await seen(groupId);
        await api.recordSettlement(groupId, b, a, s.friend(b)); // "Mark received": B paid A 50
        expect((await seen(groupId)).friend(b)).toBe(0);

        // a NEW expense paid by A, split equally: B owes 30 again
        await api.createSession({ groupId, kind: 'expense', name: 'Dinner', category: 'dining', amount: 60, splitMethod: 'equal', splitData: everyoneEqual([a, b]) });
        expect((await seen(groupId)).friend(b)).toBe(30);

        // a NEW itemized receipt paid by A with items assigned to both
        const r = await api.createSession({ groupId, name: 'Costco', participants: ['Test A', 'Test B'], items: [{ name: 'Milk', price: 10 }, { name: 'Eggs', price: 6 }] });
        const rec = await api.getSession(r);
        await api.updateItem(r, rec.items[0].id, { assigned_users: ['Test A', 'Test B'] });
        await api.updateItem(r, rec.items[1].id, { assigned_users: ['Test B'] });
        expect((await seen(groupId)).friend(b)).toBe(30 + 5 + 6);

        // B sees the mirror image
        await as('b');
        expect((await seen(groupId)).friend(a)).toBe(-41);

        // B pays everything back; then B spends on a new expense for both: A owes B
        await api.recordSettlement(groupId, b, a, 41);
        expect((await seen(groupId)).friend(a)).toBe(0);
        await api.createSession({ groupId, kind: 'expense', name: 'Taxi', category: 'transport', amount: 20, splitMethod: 'equal', splitData: everyoneEqual([a, b]) });
        expect((await seen(groupId)).friend(a)).toBe(10);
        await as('a');
        expect((await seen(groupId)).friend(b)).toBe(-10);
    });

    it('an expense paid by B that is only for B does not make A owe anything', async () => {
        await as('b');
        const before = (await seen(groupId)).friend(a);
        const solo = await api.createSession({ groupId, kind: 'expense', name: "B's own lunch", category: 'dining', amount: 18, splitMethod: 'equal', splitData: { [b]: 1 } });
        expect((await seen(groupId)).friend(a)).toBe(before);
        expect((await api.getSession(solo)).paid_by).toBe(b);
        await as('a');
        expect((await seen(groupId)).friend(b)).toBe(-before);
    });

    it('a receipt paid by B where only B has items does not charge A, even with tax and nothing else assigned', async () => {
        await as('b');
        const before = (await seen(groupId)).friend(a);
        const r = await api.createSession({ groupId, name: "B's shop", participants: ['Test A', 'Test B'], tax: 2, items: [{ name: 'Soup', price: 10 }, { name: 'Bread', price: 4 }] });
        const rec = await api.getSession(r);
        // nothing assigned yet: nobody owes anything (tax belongs to items that nobody has claimed)
        expect((await seen(groupId)).friend(a)).toBe(before);
        await api.updateItem(r, rec.items[0].id, { assigned_users: ['Test B'] });
        await api.updateItem(r, rec.items[1].id, { assigned_users: ['Test B'] });
        expect((await seen(groupId)).friend(a)).toBe(before); // all B's: A owes nothing
    });

    it('cleanup', async () => {
        await as('a');
        await api.deleteGroup(groupId);
    });
});
