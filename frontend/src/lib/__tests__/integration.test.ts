// Runs against the real Supabase project in .env.local. Opt in with: npm run test:integration
// Needs TEST_PASSWORD and three confirmed users gs-test-a@ / -b@ / -c@mailinator.com named
// "Test A" / "Test B" / "Test C" (create them in the Supabase dashboard or via SQL - Supabase
// rate-limits confirmation emails, so signup itself is not exercised here). Remove them afterwards:
//   delete from auth.users where email like 'gs-test-%@mailinator.com';
import { describe, it, expect } from 'vitest';
import { supabase } from '../supabase';
import * as api from '../api';
import { computeSplit } from '../calc';
import { parseReceiptJson, EXAMPLE_RECEIPT_JSON } from '../receiptImport';

const run = process.env.INTEGRATION ? describe : describe.skip;
const password = process.env.TEST_PASSWORD as string;
const email = (u: 'a' | 'b' | 'c') => `gs-test-${u}@mailinator.com`;

async function as(u: 'a' | 'b' | 'c') {
    await supabase.auth.signOut();
    const { error } = await supabase.auth.signInWithPassword({ email: email(u), password });
    expect(error, `sign-in as ${u} failed - is the test user confirmed?`).toBeNull();
}

run('shared groups integration', () => {
    let groupId = '';
    let sessionId = '';
    let inviteId = '';

    it('login works, bad password is rejected, profile name comes from signup metadata', async () => {
        await supabase.auth.signOut();
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
        await supabase.auth.signOut();
        expect((await supabase.from('groups').select('id')).data ?? []).toEqual([]);
    });

    it('saved people (guest contacts) are per-user', async () => {
        await as('a');
        await api.addPerson('Guest');
        await api.addPerson('Guest');
        expect(await api.listPeople()).toEqual(['Guest']);
        await as('b');
        expect(await api.listPeople()).toEqual([]);
        await as('a');
        await api.removePerson('Guest');
        expect(await api.listPeople()).toEqual([]);
    });
});
