// Runs against the real Supabase project in .env.local. Opt in with: npm run test:integration
// Needs TEST_PASSWORD and three confirmed users gs-test-a@ / -b@ / -c@mailinator.com named
// "Test A" / "Test B" / "Test C" (create them in the Supabase dashboard or via SQL - Supabase
// rate-limits confirmation emails, so signup itself is not exercised here). Remove them afterwards:
//   delete from auth.users where email like 'gs-test-%@mailinator.com';
import { describe, it, expect } from 'vitest';
import { supabase } from '../supabase';
import * as api from '../api';
import { computeSplit } from '../calc';
import { computeBalances } from '../balances';
import { parseReceiptJson, EXAMPLE_RECEIPT_JSON } from '../receiptImport';

const run = process.env.INTEGRATION ? describe : describe.skip;
const password = process.env.TEST_PASSWORD as string;
const email = (u: 'a' | 'b' | 'c') => `gs-test-${u}@mailinator.com`;

// Sign in once per user and then just swap sessions: Supabase rate-limits password sign-ins.
const sessions: Record<string, { access_token: string; refresh_token: string }> = {};
async function as(u: 'a' | 'b' | 'c') {
    const cached = sessions[u];
    if (cached) {
        const { error } = await supabase.auth.setSession(cached);
        if (!error) return;
    }
    await supabase.auth.signOut({ scope: 'local' });
    const { data, error } = await supabase.auth.signInWithPassword({ email: email(u), password });
    expect(error, `sign-in as ${u} failed - is the test user confirmed?`).toBeNull();
    sessions[u] = { access_token: data.session!.access_token, refresh_token: data.session!.refresh_token };
}

run('shared groups integration', () => {
    let groupId = '';
    let sessionId = '';
    let inviteId = '';

    it('login works, bad password is rejected, profile name comes from signup metadata', async () => {
        await supabase.auth.signOut({ scope: 'local' });
        expect((await supabase.auth.signInWithPassword({ email: email('a'), password: 'wrong-password' })).error).toBeTruthy();
        await as('a');
        const { data } = await supabase.auth.getUser();
        expect(data.user?.user_metadata.name).toBe('Test A');
    });

    it('creating a group makes the creator its owner-member', async () => {
        groupId = await api.createGroup('Roomies');
        const g = await api.getGroup(groupId);
        expect(g.members).toHaveLength(1);
        expect(g.members[0]).toMatchObject({ name: 'Test A', role: 'owner', email: email('a') });
    });

    it('imports a JSON receipt into the group', async () => {
        const r = parseReceiptJson(EXAMPLE_RECEIPT_JSON);
        sessionId = await api.createSession({ groupId, name: r.store!, date: r.date, tax: r.tax, tip: r.tip, items: r.items, participants: ['Test A'] });
        const s = await api.getSession(sessionId);
        expect(s.group_id).toBe(groupId);
        expect(s.items.map(i => i.price).sort((a, b) => a - b)).toEqual([5.99, 7.5, 12.4]);
        expect((await api.listSessions(groupId)).map(x => x.id)).toEqual([sessionId]);
    });

    it('outsiders see nothing and cannot write into the group', async () => {
        await as('c');
        expect(await api.listGroups()).toEqual([]);
        expect(await api.listSessions()).toEqual([]);
        await expect(api.createSession({ groupId, name: 'sneaky' })).rejects.toThrow();
        await expect(api.addItem(sessionId, 'x', 1)).rejects.toThrow();
        await expect(api.inviteToGroup(groupId, email('c'))).rejects.toThrow();
        expect((await supabase.from('profiles').select('email')).data?.map(p => p.email)).toEqual([email('c')]); // cannot read A's profile
        expect(await api.myInvites()).toEqual([]);
    });

    it('owner invites by email; duplicates are rejected; only the addressee sees the invite', async () => {
        await as('a');
        await api.inviteToGroup(groupId, email('b').toUpperCase()); // case-insensitive
        await expect(api.inviteToGroup(groupId, email('b'))).rejects.toThrow(/already has a pending invite/);
        const pending = await api.listPendingInvites(groupId);
        expect(pending.map(p => p.email)).toEqual([email('b')]);

        await as('c');
        expect(await api.myInvites()).toEqual([]);

        await as('b');
        const mine = await api.myInvites();
        expect(mine).toHaveLength(1);
        expect(mine[0]).toMatchObject({ group_id: groupId, group_name: 'Roomies', inviter_name: 'Test A' });
        inviteId = mine[0].id;
        expect(await api.listGroups()).toEqual([]); // not a member yet
    });

    it('a different user cannot answer someone else\'s invite', async () => {
        await as('c');
        await expect(api.respondToInvite(inviteId, true)).rejects.toThrow(/not found/i);
        expect(await api.listGroups()).toEqual([]);
    });

    it('accepting makes the invitee a member who sees members, profiles and receipts', async () => {
        await as('b');
        await api.respondToInvite(inviteId, true);
        expect(await api.myInvites()).toEqual([]);
        await expect(api.respondToInvite(inviteId, true)).rejects.toThrow(); // already answered
        const g = await api.getGroup(groupId);
        expect(g.members.map(m => `${m.name}:${m.role}`).sort()).toEqual(['Test A:owner', 'Test B:member']);
        expect((await api.listSessions(groupId)).map(s => s.id)).toEqual([sessionId]);
    });

    it('any member can edit receipts, and the split matches a hand calculation', async () => {
        await api.updateSession(sessionId, { participants: ['Test A', 'Test B'] });
        let s = await api.getSession(sessionId);
        const by = Object.fromEntries(s.items.map(i => [i.name, i]));
        await api.updateItem(sessionId, by['Organic Honeycrisp Apples'].id, { assigned_users: ['Test A'] });
        await api.updateItem(sessionId, by['Oat Milk'].id, { assigned_users: ['Test A', 'Test B'] });
        await api.updateItem(sessionId, by['Free Range Eggs'].id, { assigned_users: ['Test B'] });
        const extra = await api.addItem(sessionId, 'Manual', 1);
        await api.deleteItem(sessionId, extra.id);
        const second = await api.createSession({ groupId, name: 'B added this', items: [{ name: 'Chips', price: 3 }] });

        await as('a'); // owner sees B's edits and B's receipt
        s = await api.getSession(sessionId);
        const { totals } = computeSplit(s.items, s.participants, s.tax, s.tip);
        // A: 12.40 + 3.75 = 16.15, B: 3.75 + 5.99 = 9.74, tax 1.25 split by item cost
        expect(Object.fromEntries(totals)).toEqual({ 'Test A': 16.15 + 0.78, 'Test B': 9.74 + 0.47 });
        expect((await api.listSessions(groupId)).map(x => x.id).sort()).toEqual([sessionId, second].sort());
    });

    it('any member can delete a receipt (and its items); outsiders cannot', async () => {
        await as('a');
        const doomed = await api.createSession({ groupId, name: 'Doomed', items: [{ name: 'Gum', price: 1 }] });
        await as('c');
        await api.deleteSession(doomed); // RLS: affects 0 rows
        await as('b');
        expect((await api.getSession(doomed)).items).toHaveLength(1);
        await api.deleteSession(doomed);
        await as('a');
        expect((await api.listSessions(groupId)).some(x => x.id === doomed)).toBe(false);
        expect((await supabase.from('items').select('id').eq('session_id', doomed)).data).toEqual([]);
    });

    it('payer defaults to the creator, must be a member, and drives balances; settlements follow the rules', async () => {
        const uid = async (u: 'a' | 'b' | 'c') => { await as(u); return (await supabase.auth.getUser()).data.user!.id; };
        const [a, b, c] = [await uid('a'), await uid('b'), await uid('c')];

        await as('a');
        const rec = await api.createSession({ groupId, name: 'Dinner', items: [{ name: 'Pizza', price: 20 }], participants: ['Test A', 'Test B'] });
        let s = await api.getSession(rec);
        expect(s.paid_by).toBe(a); // defaults to whoever added it
        await api.updateItem(rec, s.items[0].id, { assigned_users: ['Test A', 'Test B'] });
        await expect(api.updateSession(rec, { paid_by: c })).rejects.toThrow(); // outsider cannot be the payer

        const g = await api.getGroup(groupId);
        let bal = computeBalances(a, [g], await api.listSessions(groupId), []);
        const owedBefore = bal.friends[b].net;
        expect(owedBefore).toBeGreaterThanOrEqual(10); // B owes A at least B's half of the pizza

        await as('b'); // B can change the payer to themselves; the balance flips from B's side
        await api.updateSession(rec, { paid_by: b });
        expect((await api.getSession(rec)).paid_by).toBe(b);
        await api.updateSession(rec, { paid_by: a });

        // settlements: either party can record, outsiders and bystanders cannot
        await api.recordSettlement(groupId, b, a, 10);
        await expect(api.recordSettlement(groupId, b, a, 0)).rejects.toThrow();
        await as('c');
        await expect(api.recordSettlement(groupId, c, a, 5)).rejects.toThrow();
        expect(await api.listSettlements()).toEqual([]);
        await as('a');
        await expect(api.recordSettlement(groupId, b, c, 5)).rejects.toThrow(); // not a party
        const [st] = await api.listSettlements();
        expect(st).toMatchObject({ group_id: groupId, from_user: b, to_user: a, amount: 10 });
        bal = computeBalances(a, [g], await api.listSessions(groupId), await api.listSettlements());
        expect(bal.friends[b].net).toBeCloseTo(owedBefore - 10, 2);

        await api.deleteSettlement(st.id); // A is not the creator: silently affects 0 rows
        expect(await api.listSettlements()).toHaveLength(1);
        await as('b');
        await api.deleteSettlement(st.id);
        expect(await api.listSettlements()).toEqual([]);
        await as('a');
        await api.deleteSession(rec);
    });

    it('non-owner members cannot invite, remove others, or delete the group', async () => {
        await as('b');
        await expect(api.inviteToGroup(groupId, email('c'))).rejects.toThrow();
        const g = await api.getGroup(groupId);
        const ownerId = g.owner_id;
        await api.removeMember(groupId, ownerId); // silently affects 0 rows (RLS)
        await api.deleteGroup(groupId); // same
        expect((await api.getGroup(groupId)).members).toHaveLength(2);
        expect((await api.getGroup(groupId)).name).toBe('Roomies');
    });

    it('declined invites grant nothing; owner can revoke pending ones', async () => {
        await as('a');
        await api.inviteToGroup(groupId, email('c'));
        await as('c');
        const [inv] = await api.myInvites();
        await api.respondToInvite(inv.id, false);
        expect(await api.listGroups()).toEqual([]);
        await as('a');
        await api.inviteToGroup(groupId, email('c')); // re-invite after decline is allowed
        const [p] = await api.listPendingInvites(groupId);
        await api.revokeInvite(p.id);
        expect(await api.listPendingInvites(groupId)).toEqual([]);
    });

    it('a member can leave and loses access; the owner cannot be removed', async () => {
        await as('b');
        const me = (await supabase.auth.getUser()).data.user!.id;
        await api.removeMember(groupId, me);
        expect(await api.listGroups()).toEqual([]);
        expect(await api.listSessions()).toEqual([]);
        await as('a');
        const g = await api.getGroup(groupId);
        expect(g.members.map(m => m.name)).toEqual(['Test A']);
        await api.removeMember(groupId, g.owner_id); // owner row is protected
        expect((await api.getGroup(groupId)).members).toHaveLength(1);
    });

    it('deleting the group removes its receipts and items', async () => {
        await api.deleteGroup(groupId);
        expect(await api.listGroups()).toEqual([]);
        expect(await api.listSessions()).toEqual([]);
        const { data } = await supabase.from('items').select('id');
        expect(data).toEqual([]);
        await supabase.auth.signOut({ scope: 'local' });
        expect((await supabase.from('groups').select('id')).data ?? []).toEqual([]);
    });

    it('users can rename themselves but cannot edit their stored profile email', async () => {
        await as('a');
        const myGroup = await api.createGroup('Rename check');
        await api.updateDisplayName('  Alice  ');
        expect((await supabase.auth.getUser()).data.user?.user_metadata.name).toBe('Alice');
        expect((await api.getGroup(myGroup)).members[0].name).toBe('Alice');
        await expect(api.updateDisplayName('   ')).rejects.toThrow();

        const me = (await supabase.auth.getUser()).data.user!.id;
        const spoof = await supabase.from('profiles').update({ email: 'someone-else@example.com' }).eq('id', me);
        expect(spoof.error).toBeTruthy();
        const other = await supabase.from('profiles').update({ name: 'hijacked' }).neq('id', me).select();
        expect(other.data ?? []).toEqual([]);

        await api.updateDisplayName('Test A');
        await api.deleteGroup(myGroup);
    });

    it('changing the password requires the current one, and the new one works', async () => {
        await as('b');
        await expect(api.changePassword('not-my-password', 'brand-new-pass-1')).rejects.toThrow(/incorrect/i);
        await api.changePassword(password, 'brand-new-pass-1');
        await supabase.auth.signOut({ scope: 'local' });
        expect((await supabase.auth.signInWithPassword({ email: email('b'), password })).error).toBeTruthy();
        const ok = await supabase.auth.signInWithPassword({ email: email('b'), password: 'brand-new-pass-1' });
        expect(ok.error).toBeNull();
        await api.changePassword('brand-new-pass-1', password); // restore for reruns
        await supabase.auth.signOut({ scope: 'local' });
        expect((await supabase.auth.signInWithPassword({ email: email('b'), password })).error).toBeNull();
    });
});
