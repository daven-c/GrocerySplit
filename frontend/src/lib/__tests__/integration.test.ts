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
let current: 'a' | 'b' | 'c' | null = null;
async function as(u: 'a' | 'b' | 'c') {
    const cached = sessions[u];
    if (cached) {
        const { error } = await supabase.auth.setSession(cached);
        if (!error) { current = u; return; }
    }
    await supabase.auth.signOut({ scope: 'local' });
    const { data, error } = await supabase.auth.signInWithPassword({ email: email(u), password });
    expect(error, `sign-in as ${u} failed - is the test user confirmed?`).toBeNull();
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
        await expect(api.inviteToGroup(groupId, await handle('c'))).rejects.toThrow();
        expect((await supabase.from('profiles').select('email')).data?.map(p => p.email)).toEqual([email('c')]); // cannot read A's profile
        expect(await api.myInvites()).toEqual([]);
    });

    it('owner invites by username; duplicates are rejected; only the addressee sees the invite', async () => {
        await as('a');
        await api.inviteToGroup(groupId, (await handle('b')).toUpperCase()); // case-insensitive
        await expect(api.inviteToGroup(groupId, await handle('b'))).rejects.toThrow(/already has a pending invite/);
        const pending = await api.listPendingInvites(groupId);
        expect(pending.map(p => p.name)).toEqual(['Test B']); // the display name, never the email

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

        await api.deleteSettlement(st.id); // any member can delete a transfer (it is logged in Activity)
        expect(await api.listSettlements()).toEqual([]);
        const log = await api.listSettlementLog(groupId);
        expect(log.map(l => l.action).sort()).toEqual(['created', 'deleted']);
        await as('a');
        await api.deleteSession(rec);
    });

    it('standalone expenses: created with a split, readable by members, editable by any member, hidden from outsiders', async () => {
        const uid = async (u: 'a' | 'b' | 'c') => { await as(u); return (await supabase.auth.getUser()).data.user!.id; };
        const [a, b] = [await uid('a'), await uid('b')];

        await as('a');
        const rent = await api.createSession({
            groupId, kind: 'expense', name: 'October rent', category: 'rent', amount: 2400, splitMethod: 'shares', splitData: { [a]: 2, [b]: 1 },
        });
        const s = await api.getSession(rent);
        expect(s).toMatchObject({ kind: 'expense', category: 'rent', amount: 2400, split_method: 'shares', split_data: { [a]: 2, [b]: 1 }, paid_by: a, items: [] });
        expect((await api.listSessions(groupId)).find(x => x.id === rent)?.kind).toBe('expense');
        expect((await api.listSessions(groupId)).filter(x => x.kind === 'receipt').length).toBeGreaterThan(0); // receipts untouched

        const g = await api.getGroup(groupId);
        expect(g.members.every(m => !!m.joined_at)).toBe(true);
        expect(g.members[0].role).toBe('owner');

        // Balances from real rows: B owes A a third of 2400 (shares 1 of 3)
        let bal = computeBalances(a, [g], (await api.listSessions(groupId)).filter(x => x.id === rent), []);
        expect(bal.friends[b].net).toBe(800);

        await as('b'); // any member can edit an expense
        await api.updateSession(rent, { amount: 3000, split_method: 'equal', split_data: { [a]: 1, [b]: 1 }, category: 'utilities' });
        expect(await api.getSession(rent)).toMatchObject({ amount: 3000, split_method: 'equal', category: 'utilities' });
        await as('a');
        bal = computeBalances(a, [await api.getGroup(groupId)], (await api.listSessions(groupId)).filter(x => x.id === rent), []);
        expect(bal.friends[b].net).toBe(1500);

        await as('c'); // outsiders see nothing and cannot edit
        expect((await api.listSessions()).some(x => x.id === rent)).toBe(false);
        await api.updateSession(rent, { amount: 1 }); // RLS: affects 0 rows
        await as('a');
        expect((await api.getSession(rent)).amount).toBe(3000);
        await api.deleteSession(rent);
    });

    it('the database rejects malformed expenses and locks kind and group', async () => {
        await as('a');
        const a = (await supabase.auth.getUser()).data.user!.id;
        const b = (await api.getGroup(groupId)).members.find(m => m.user_id !== a)!.user_id;
        const insert = async (patch: Record<string, unknown>) =>
            (await supabase.from('sessions').insert({ group_id: groupId, name: 'x', kind: 'expense', amount: 100, split_method: 'equal', split_data: { [a]: 1, [b]: 1 }, ...patch })).error;

        // column constraints
        expect((await supabase.from('sessions').insert({ group_id: groupId, name: 'x', kind: 'expense' })).error).toBeTruthy(); // no amount / method
        expect(await insert({ amount: -5 })).toBeTruthy();
        expect(await insert({ split_method: 'bogus' })).toBeTruthy();
        expect((await supabase.from('sessions').insert({ group_id: groupId, name: 'x', kind: 'invoice' })).error).toBeTruthy();
        expect((await supabase.from('sessions').insert({ group_id: groupId, name: 'x', category: '' })).error).toBeTruthy();
        expect((await supabase.from('sessions').insert({ group_id: groupId, name: 'x', category: 'x'.repeat(31) })).error).toBeTruthy();

        // split validation (trigger)
        expect((await insert({ split_data: {} }))?.message).toMatch(/at least one person/i);
        expect((await insert({ split_data: { [a]: 1, 'not-a-member': 1 } }))?.message).toMatch(/not in the group/i);
        expect((await insert({ split_data: { [a]: -1, [b]: 101 }, split_method: 'exact' }))?.message).toMatch(/negative/i);
        expect((await insert({ split_method: 'exact', split_data: { [a]: 60, [b]: 30 } }))?.message).toMatch(/add up to the total/i);
        expect((await insert({ split_method: 'percent', split_data: { [a]: 60, [b]: 30 } }))?.message).toMatch(/add up to 100/i);
        expect((await insert({ split_method: 'shares', split_data: { [a]: 0, [b]: 0 } }))?.message).toMatch(/at least one person a share/i);
        expect((await insert({ split_data: [a] as unknown }))?.message).toBeTruthy();

        // valid ones go through
        const ok = await supabase.from('sessions').insert({ group_id: groupId, name: 'valid', kind: 'expense', amount: 100, split_method: 'exact', split_data: { [a]: 60, [b]: 40 } }).select('id').single();
        expect(ok.error).toBeNull();
        const id = ok.data!.id;

        // kind and group cannot change; unrelated edits are never blocked by the split
        expect((await supabase.from('sessions').update({ kind: 'receipt' }).eq('id', id)).error).toBeNull(); // one editor: it can switch to itemized
        expect((await supabase.from('sessions').update({ kind: 'expense' }).eq('id', id)).error).toBeNull();
        const other = await api.createGroup('Elsewhere');
        expect((await supabase.from('sessions').update({ group_id: other }).eq('id', id)).error?.message).toMatch(/cannot move/i);
        await api.deleteGroup(other);
        expect((await supabase.from('sessions').update({ name: 'renamed' }).eq('id', id)).error).toBeNull();
        expect((await supabase.from('sessions').update({ amount: 200 }).eq('id', id)).error?.message).toMatch(/add up to the total/i); // amount changed, split now stale
        expect((await supabase.from('sessions').update({ amount: 200, split_data: { [a]: 120, [b]: 80 } }).eq('id', id)).error).toBeNull();
        await api.deleteSession(id);
    });

    it('drafts are invisible to other members until saved, and are not removed while fresh', async () => {
        const a = (await (async () => { await as('a'); return supabase.auth.getUser(); })()).data.user!.id;
        const draft = await api.createSession({ groupId, kind: 'expense', draft: true, name: 'Half-typed', category: 'other', amount: 0, splitMethod: 'equal', splitData: { [a]: 1 } });

        expect((await api.getSession(draft)).draft).toBe(true); // the author can open it
        expect((await api.listSessions(groupId)).some(x => x.id === draft && x.draft)).toBe(true); // ...and it is flagged as a draft

        await as('b');
        expect((await api.listSessions(groupId)).some(x => x.id === draft)).toBe(false); // other members never see it
        await expect(api.getSession(draft)).rejects.toThrow();

        await as('a');
        await api.deleteStaleDrafts(); // a day-old cutoff: a fresh draft survives
        expect((await api.getSession(draft)).draft).toBe(true);

        await api.updateSession(draft, { name: 'Real now', draft: false });
        await as('b');
        expect((await api.listSessions(groupId)).find(x => x.id === draft)).toMatchObject({ name: 'Real now', draft: false });
        await as('a');
        await api.deleteSession(draft);
    });

    it('any member can record a transfer between two other members; outsiders cannot; only the recorder can undo', async () => {
        const uid = async (u: 'a' | 'b' | 'c') => { await as(u); return (await supabase.auth.getUser()).data.user!.id; };
        const [a, b, c] = [await uid('a'), await uid('b'), await uid('c')];

        await as('a'); // bring C into the group so there are three members
        await api.inviteToGroup(groupId, await handle('c'));
        await as('c');
        await api.respondToInvite((await api.myInvites())[0].id, true);

        await as('b'); // B is neither the payer nor the receiver
        await api.recordSettlement(groupId, a, c, 12.5);
        const [pb] = (await api.listSettlements()).filter(x => x.from_user === a && x.to_user === c);
        expect(pb).toMatchObject({ group_id: groupId, amount: 12.5, created_by: b });

        await as('a'); // everyone in the group can see it, edit it, and delete it
        expect((await api.listSettlements()).some(x => x.id === pb.id)).toBe(true);
        await api.updateSettlement(pb.id, a, c, 20);
        expect((await api.listSettlements()).find(x => x.id === pb.id)?.amount).toBe(20);
        await expect(api.recordSettlement(groupId, a, a, 5)).rejects.toThrow(); // can't pay yourself

        await api.deleteSettlement(pb.id);
        expect((await api.listSettlements()).some(x => x.id === pb.id)).toBe(false);
        const actions = (await api.listSettlementLog(groupId)).filter(l => l.settlement_id === pb.id).map(l => l.action).sort();
        expect(actions).toEqual(['created', 'deleted', 'edited']); // all three are in the ledger

        await as('a'); // put C back outside the group for the tests that follow
        await api.removeMember(groupId, c);
        await as('c');
        await expect(api.recordSettlement(groupId, a, b, 1)).rejects.toThrow(); // outsiders cannot record transfers
    });

    it('non-owner members cannot invite, remove others, or delete the group', async () => {
        await as('b');
        await expect(api.inviteToGroup(groupId, await handle('c'))).rejects.toThrow();
        const g = await api.getGroup(groupId);
        const ownerId = g.owner_id;
        await api.removeMember(groupId, ownerId); // silently affects 0 rows (RLS)
        await api.deleteGroup(groupId); // same
        expect((await api.getGroup(groupId)).members).toHaveLength(2);
        expect((await api.getGroup(groupId)).name).toBe('Roomies');
    });

    it('declined invites grant nothing; owner can revoke pending ones', async () => {
        await as('a');
        await api.inviteToGroup(groupId, await handle('c'));
        await as('c');
        const [inv] = await api.myInvites();
        await api.respondToInvite(inv.id, false);
        expect(await api.listGroups()).toEqual([]);
        await as('a');
        await api.inviteToGroup(groupId, await handle('c')); // re-invite after decline is allowed
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

    it('admin dashboard: only admins can list users or create accounts', async () => {
        // gs-test-a is made an admin by the test setup SQL; b and c are regular users.
        await as('b');
        expect(await api.isAdmin()).toBe(false);
        await expect(api.adminListUsers()).rejects.toThrow(/not authorized/i);
        await expect(api.adminTotals()).rejects.toThrow(/not authorized/i);
        await expect(api.adminCreateUser({ name: 'X', email: 'gs-test-x@mailinator.com', password: 'longenough1', confirm: true, makeAdmin: false })).rejects.toThrow(/admins only/i);
        const me = (await supabase.auth.getUser()).data.user!.id;
        expect((await supabase.from('admins').insert({ user_id: me })).error).toBeTruthy(); // cannot self-promote
        expect((await supabase.from('admins').select('user_id')).data).toEqual([]); // cannot see who the admins are

        await supabase.auth.signOut({ scope: 'local' });
        await expect(api.adminCreateUser({ name: 'X', email: 'gs-test-x@mailinator.com', password: 'longenough1', confirm: true, makeAdmin: false })).rejects.toThrow();
        expect((await supabase.rpc('admin_list_users')).error).toBeTruthy(); // anon

        await as('a');
        expect(await api.isAdmin()).toBe(true);
        const users = await api.adminListUsers();
        expect(users.map(u => u.email)).toEqual(expect.arrayContaining([email('a'), email('b'), email('c')]));
        expect(users.find(u => u.email === email('a'))).toMatchObject({ is_admin: true, email_confirmed: true, name: 'Test A' });
        expect(users.find(u => u.email === email('b'))?.is_admin).toBe(false);
        const totals = await api.adminTotals();
        expect(totals.groups).toBeGreaterThanOrEqual(1);
    });

    it('admin can force-create a confirmed user who can sign in immediately', async () => {
        await as('a');
        const created = await api.adminCreateUser({ name: 'Forced D', email: 'GS-Test-D@mailinator.com', password: 'forced-pass-123', confirm: true, makeAdmin: false });
        expect(created.email).toBe('gs-test-d@mailinator.com');
        await expect(api.adminCreateUser({ name: 'Dup', email: 'gs-test-d@mailinator.com', password: 'forced-pass-123', confirm: true, makeAdmin: false })).rejects.toThrow(/already exists/i);
        await expect(api.adminCreateUser({ name: 'Weak', email: 'gs-test-w@mailinator.com', password: 'short', confirm: true, makeAdmin: false })).rejects.toThrow(/at least 8/i);
        await expect(api.adminCreateUser({ name: '', email: 'gs-test-w@mailinator.com', password: 'longenough1', confirm: true, makeAdmin: false })).rejects.toThrow(/name/i);

        const listed = (await api.adminListUsers()).find(u => u.email === 'gs-test-d@mailinator.com')!;
        expect(listed).toMatchObject({ name: 'Forced D', email_confirmed: true, is_admin: false, groups_count: 0 });

        const fresh = await supabase.auth.signInWithPassword({ email: 'gs-test-d@mailinator.com', password: 'forced-pass-123' });
        expect(fresh.error).toBeNull();
        await as('a');
        expect((await api.adminListUsers()).find(u => u.email === 'gs-test-d@mailinator.com')?.last_sign_in_at).toBeTruthy();
    });

    it('admin can create an unconfirmed user, force-confirm them, and promote on create', async () => {
        await as('a');
        const e = await api.adminCreateUser({ name: 'Pending E', email: 'gs-test-e@mailinator.com', password: 'pending-pass-123', confirm: false, makeAdmin: true });
        let row = (await api.adminListUsers()).find(u => u.id === e.id)!;
        expect(row).toMatchObject({ email_confirmed: false, is_admin: true });
        await api.adminConfirmUser(e.id);
        row = (await api.adminListUsers()).find(u => u.id === e.id)!;
        expect(row.email_confirmed).toBe(true);
        await expect(api.adminConfirmUser('')).rejects.toThrow();
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
