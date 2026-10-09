// Real-database scenario test of what users actually do. Opt in: npm run test:integration (needs TEST_PASSWORD
// and confirmed users gs-test-a@ / -b@mailinator.com).
import { describe, it, expect } from 'vitest';
import { supabase } from '../supabase';
import * as api from '../api';
import { computeBalances } from '../balances';
import { everyoneEqual } from '../expenses';
import { addQuickItems, claimQuickSplit, createQuickSplit, deleteQuickSplit, getQuickSplit, lockQuickSplit, renameQuickSplit } from '../quickSplit';

const run = process.env.INTEGRATION ? describe : describe.skip;
const password = process.env.TEST_PASSWORD as string;
const sessions: Record<string, { access_token: string; refresh_token: string }> = {};
let current: 'a' | 'b' | 'c' | null = null;
async function as(u: 'a' | 'b' | 'c') {
    const c = sessions[u];
    if (c && !(await supabase.auth.setSession(c)).error) { current = u; return; }
    await supabase.auth.signOut({ scope: 'local' });
    const { data, error } = await supabase.auth.signInWithPassword({ email: `gs-test-${u}@mailinator.com`, password });
    expect(error).toBeNull();
    sessions[u] = { access_token: data.session!.access_token, refresh_token: data.session!.refresh_token };
    current = u;
}

/** Usernames are what invites go by; look one up and go back to being whoever was signed in. */
const handles: Record<string, string> = {};
async function handle(u: 'a' | 'b' | 'c') {
    if (!handles[u]) {
        const was = current;
        await as(u);
        handles[u] = await api.getMyUsername();
        if (was && was !== u) await as(was);
    }
    return handles[u];
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
        await api.inviteToGroup(groupId, await handle('b'));
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
        const r = await api.createSession({ groupId, name: 'Costco', participants: [a, b], items: [{ name: 'Milk', price: 10 }, { name: 'Eggs', price: 6 }] });
        const rec = await api.getSession(r);
        await api.updateItem(r, rec.items[0].id, { assigned_users: [a, b] });
        await api.updateItem(r, rec.items[1].id, { assigned_users: [b] });
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
        const r = await api.createSession({ groupId, name: "B's shop", participants: [a, b], tax: 2, items: [{ name: 'Soup', price: 10 }, { name: 'Bread', price: 4 }] });
        const rec = await api.getSession(r);
        // nothing assigned yet: nobody owes anything (tax belongs to items that nobody has claimed)
        expect((await seen(groupId)).friend(a)).toBe(before);
        await api.updateItem(r, rec.items[0].id, { assigned_users: [b] });
        await api.updateItem(r, rec.items[1].id, { assigned_users: [b] });
        expect((await seen(groupId)).friend(a)).toBe(before); // all B's: A owes nothing
    });

    it('an expense can be switched to itemized and back without losing its details', async () => {
        await as('a');
        const id = await api.createSession({ groupId, kind: 'expense', draft: true, name: 'Switch me', category: 'groceries', amount: 20, splitMethod: 'equal', splitData: everyoneEqual([a, b]) });
        await api.updateSession(id, { kind: 'receipt', participants: [a, b] });
        expect(await api.getSession(id)).toMatchObject({ kind: 'receipt', name: 'Switch me', category: 'groceries' });
        await api.updateSession(id, { kind: 'expense', amount: 20, split_method: 'equal', split_data: everyoneEqual([a, b]) });
        expect(await api.getSession(id)).toMatchObject({ kind: 'expense', name: 'Switch me', amount: 20, split_method: 'equal' });
        await api.deleteSession(id);
    });

    it('a username can be changed, but not to a taken or malformed one', async () => {
        await as('a');
        const before = await api.getMyUsername();
        await api.updateUsername('scenario_a_tmp');
        expect(await api.getMyUsername()).toBe('scenario_a_tmp');
        await as('b');
        await expect(api.updateUsername('scenario_a_tmp')).rejects.toThrow('taken');
        await expect(api.updateUsername('x')).rejects.toThrow('3 to 20');
        await as('a');
        await api.updateUsername(before);
    });

    it('Activity records every creation, edit and deletion, once per save, by whoever did it', async () => {
        await as('a');
        const before = (await api.listExpenseLog(groupId)).length;
        // a draft is invisible until saved
        const id = await api.createSession({ groupId, kind: 'expense', draft: true, name: 'Dinner', category: 'dining', amount: 0, splitMethod: 'exact', splitData: {} });
        await api.updateSession(id, { amount: 40, split_data: { [a]: 20, [b]: 20 } });
        expect((await api.listExpenseLog(groupId)).length).toBe(before);
        await expect(api.updateSession(id, { draft: false, split_data: {} })).rejects.toThrow(/at least one person/i); // nobody selected can't be saved
        await api.updateSession(id, { draft: false });
        await as('b');
        await api.updateSession(id, { amount: 50, split_data: { [a]: 25, [b]: 25 }, paid_by: b });
        await as('a');
        await api.deleteSession(id);
        const log = (await api.listExpenseLog(groupId)).filter(l => l.session_id === id);
        expect(log.map(l => l.action)).toEqual(['deleted', 'edited', 'created']); // newest first
        expect(log[1]).toMatchObject({ actor: b, name: 'Dinner', total: 50 });
        expect(log[1].changes.map(c => c.field).sort()).toEqual(['amount', 'paid_by', 'split']);
        expect(log[1].changes.find(c => c.field === 'paid_by')).toMatchObject({ from: 'Test A', to: 'Test B' });
        expect(log[0]).toMatchObject({ actor: a, total: 50 });
    });

    it('saving a receipt is one atomic step and one log entry, with an item-level diff', async () => {
        await as('a');
        const rid = await api.createSession({ groupId, name: 'Costco', category: 'groceries', participants: [a, b], items: [{ name: 'Milk', price: 4 }, { name: 'Eggs', price: 3 }] });
        const rec = await api.getSession(rid);
        const milk = rec.items.find(i => i.name === 'Milk')!;
        await api.saveReceipt(rid, { name: 'Costco run', tax: 1 }, [
            { id: milk.id, name: 'Milk', price: 5, assigned_users: [a] },
            { name: 'Bread', price: 2, assigned_users: [] },
        ]);
        const after = await api.getSession(rid);
        expect(after.name).toBe('Costco run');
        expect(after.items.map(i => i.name).sort()).toEqual(['Bread', 'Milk']);
        expect(after.items.find(i => i.name === 'Milk')).toMatchObject({ price: 5, assigned_users: [a] });
        const edits = (await api.listExpenseLog(groupId)).filter(l => l.session_id === rid && l.action === 'edited');
        expect(edits).toHaveLength(1);
        expect(edits[0].total).toBe(8); // 5 + 2 + tax 1
        expect(edits[0].changes.find(c => c.field === 'items')).toMatchObject({ added: ['Bread'], removed: ['Eggs'], changed: ['Milk'] });
        // an outsider cannot save someone else's receipt
        await as('c');
        await expect(api.saveReceipt(rid, { name: 'hacked' }, [])).rejects.toThrow();
        await as('a');
        expect((await api.getSession(rid)).name).toBe('Costco run');
        await api.deleteSession(rid);
    });

    it('a quick split made while signed in is listed under Personal and owned by the account, on any device', async () => {
        await as('a');
        const { token, ownerKey } = await createQuickSplit('Sushi night');
        await addQuickItems(token, [{ name: 'Roll', price: 12 }], ownerKey);
        const mine = await api.listMyQuickSplits();
        expect(mine.find(m => m.token === token)).toMatchObject({ title: 'Sushi night', people: 0, items: 1, total: 12, locked: false });
        expect((await getQuickSplit(token))!.is_owner).toBe(true);
        // another account sees it by link, can edit items, but neither lists it nor owns it
        await as('b');
        expect((await api.listMyQuickSplits()).some(m => m.token === token)).toBe(false);
        expect((await getQuickSplit(token))!.is_owner).toBe(false);
        await expect(renameQuickSplit(token, null, 'hijack')).rejects.toThrow(/Only the owner/);
        await expect(deleteQuickSplit(token, 'wrong')).rejects.toThrow(/Only the owner/);
        await expect(claimQuickSplit(token, 'wrong')).rejects.toThrow(/Only the owner/);
        // the owning account manages it without the key (a different device)
        await as('a');
        await renameQuickSplit(token, null, 'From my phone');
        await lockQuickSplit(token, null, true);
        expect((await api.listMyQuickSplits()).find(m => m.token === token)).toMatchObject({ title: 'From my phone', locked: true });
        await deleteQuickSplit(token, null);
        expect((await api.listMyQuickSplits()).some(m => m.token === token)).toBe(false);
        // an anonymous split is attached by claiming it with its key
        const anon = await createQuickSplit('Anon');
        await claimQuickSplit(anon.token, anon.ownerKey);
        expect((await api.listMyQuickSplits()).some(m => m.token === anon.token)).toBe(true);
        await deleteQuickSplit(anon.token, anon.ownerKey);
        void ownerKey;
    });

    it('cleanup', async () => {
        await as('a');
        await api.deleteGroup(groupId);
    });
});
