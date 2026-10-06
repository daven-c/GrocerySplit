import { supabase } from './supabase';
import type { SplitData, SplitMethod } from './expenses';

export interface Item {
    id: string;
    name: string;
    price: number;
    assigned_users: string[];
}

export interface Session {
    id: string;
    group_id: string;
    user_id: string | null;
    paid_by: string | null;
    /** 'receipt' = itemized (the grocery flow); 'expense' = a standalone cost split by `split_method`. */
    kind: 'receipt' | 'expense';
    /** True until the author presses Save; drafts are hidden from everyone else and from lists and balances. */
    draft: boolean;
    category: string;
    amount: number | null;
    split_method: SplitMethod | null;
    split_data: SplitData;
    name: string;
    session_date: string;
    tax: number;
    tip: number;
    participants: string[];
    updated_at: string;
    items: Item[];
}

const check = <T>(res: { data: T; error: { message: string } | null }): NonNullable<T> => {
    if (res.error) throw new Error(res.error.message);
    return res.data as NonNullable<T>;
};

const mapItem = (r: any): Item => ({
    id: r.id,
    name: r.name,
    price: Number(r.price),
    assigned_users: r.assigned_users ?? [],
});

const mapSession = (r: any): Session => ({
    id: r.id,
    group_id: r.group_id,
    user_id: r.user_id ?? null,
    paid_by: r.paid_by ?? null,
    kind: r.kind ?? 'receipt',
    draft: !!r.draft,
    category: r.category ?? 'groceries',
    amount: r.amount === null || r.amount === undefined ? null : Number(r.amount),
    split_method: r.split_method ?? null,
    split_data: r.split_data ?? {},
    name: r.name,
    session_date: r.session_date,
    tax: Number(r.tax),
    tip: Number(r.tip),
    participants: r.participants ?? [],
    updated_at: r.updated_at,
    items: (r.items ?? []).map(mapItem),
});

const touch = (sessionId: string) =>
    supabase.from('sessions').update({ updated_at: new Date().toISOString() }).eq('id', sessionId);

// ---- Sessions (receipts) ----
export async function listSessions(groupId?: string): Promise<Session[]> {
    let q = supabase.from('sessions').select('*, items(*)').order('updated_at', { ascending: false });
    if (groupId) q = q.eq('group_id', groupId);
    const data = check(await q);
    return data.map(mapSession);
}

export async function getSession(id: string): Promise<Session> {
    const data = check(await supabase.from('sessions').select('*, items(*)').eq('id', id).single());
    return mapSession(data);
}

export async function createSession(input: {
    groupId: string;
    kind?: 'receipt' | 'expense';
    draft?: boolean;
    category?: string;
    amount?: number;
    splitMethod?: SplitMethod;
    splitData?: SplitData;
    name: string;
    date?: string;
    tax?: number;
    tip?: number;
    participants?: string[];
    items?: { name: string; price: number }[];
}): Promise<string> {
    const s = check(
        await supabase
            .from('sessions')
            .insert({
                group_id: input.groupId,
                name: input.name,
                ...(input.kind ? { kind: input.kind } : {}),
                ...(input.draft ? { draft: true } : {}),
                ...(input.category ? { category: input.category } : {}),
                ...(input.kind === 'expense' ? { amount: input.amount ?? 0, split_method: input.splitMethod ?? 'equal', split_data: input.splitData ?? {} } : {}),
                ...(input.date ? { session_date: input.date } : {}),
                tax: input.tax ?? 0,
                tip: input.tip ?? 0,
                participants: input.participants ?? [],
            })
            .select('id')
            .single()
    );
    if (input.items?.length) {
        const { error } = await supabase
            .from('items')
            .insert(input.items.map(i => ({ session_id: s.id, name: i.name, price: i.price })));
        if (error) {
            await supabase.from('sessions').delete().eq('id', s.id); // don't leave an empty half-import behind
            throw new Error(error.message);
        }
    }
    return s.id;
}

/**
 * Add the items from an imported receipt to an existing (usually blank) receipt. Tax and tip are added to what is
 * already there, the date is taken from the import, and a placeholder name is replaced by the store name.
 */
export async function importReceiptIntoSession(
    sessionId: string,
    input: { store?: string; date?: string; tax: number; tip: number; items: { name: string; price: number }[] }
) {
    const cur = check(await supabase.from('sessions').select('name, tax, tip').eq('id', sessionId).single());
    check(await supabase.from('items').insert(input.items.map(i => ({ session_id: sessionId, name: i.name, price: i.price }))));
    const placeholder = ['Receipt', 'Manual Receipt', 'Grocery Trip'].includes(cur.name);
    await updateSession(sessionId, {
        tax: Math.round((Number(cur.tax) + input.tax) * 100) / 100,
        tip: Math.round((Number(cur.tip) + input.tip) * 100) / 100,
        ...(input.date ? { session_date: input.date } : {}),
        ...(placeholder && input.store ? { name: input.store } : {}),
    });
}

export async function updateSession(
    id: string,
    patch: Partial<Pick<Session, 'name' | 'session_date' | 'tax' | 'tip' | 'participants' | 'paid_by' | 'category' | 'amount' | 'split_method' | 'split_data' | 'draft' | 'kind'>>
) {
    check(await supabase.from('sessions').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id));
}

/** Drafts you started but never saved (closed the tab, lost connection) are tidied away after a day. */
export async function deleteStaleDrafts() {
    const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    check(await supabase.from('sessions').delete().eq('draft', true).eq('user_id', data.user.id).lt('updated_at', cutoff));
}

export async function deleteSession(id: string) {
    check(await supabase.from('sessions').delete().eq('id', id));
}

// ---- Items ----
export async function addItem(sessionId: string, name: string, price: number): Promise<Item> {
    const row = check(await supabase.from('items').insert({ session_id: sessionId, name, price }).select().single());
    await touch(sessionId);
    return mapItem(row);
}

export async function updateItem(
    sessionId: string,
    id: string,
    patch: Partial<Pick<Item, 'name' | 'price' | 'assigned_users'>>
) {
    check(await supabase.from('items').update(patch).eq('id', id));
    await touch(sessionId);
}

export async function deleteItem(sessionId: string, id: string) {
    check(await supabase.from('items').delete().eq('id', id));
    await touch(sessionId);
}

// ---- Account ----
export async function updateDisplayName(name: string) {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Name cannot be empty.');
    const { data, error } = await supabase.auth.updateUser({ data: { name: trimmed } });
    if (error) throw new Error(error.message);
    check(await supabase.from('profiles').update({ name: trimmed }).eq('id', data.user.id));
}

/** Supabase sends a confirmation link to the new address; the email only changes once it is clicked. */
export async function requestEmailChange(email: string) {
    const { error } = await supabase.auth.updateUser({ email: email.trim().toLowerCase() });
    if (error) throw new Error(/rate limit/i.test(error.message) ? 'Too many emails were sent recently. Please wait about an hour and try again.' : error.message);
}

export async function changePassword(current: string, next: string) {
    const { data } = await supabase.auth.getUser();
    const email = data.user?.email;
    if (!email) throw new Error('You are not signed in.');
    // Re-verify the current password so a borrowed, unlocked session can't change it.
    const check1 = await supabase.auth.signInWithPassword({ email, password: current });
    if (check1.error) throw new Error('Current password is incorrect.');
    const { error } = await supabase.auth.updateUser({ password: next });
    if (error) throw new Error(error.message);
}

// ---- Shared groups ----
export interface Member {
    user_id: string;
    joined_at: string;
    name: string;
    email: string;
    role: 'owner' | 'member';
}

export interface Group {
    id: string;
    name: string;
    owner_id: string;
    created_at: string;
    members: Member[];
}

export interface Invite {
    id: string;
    group_id: string;
    group_name: string;
    inviter_name: string;
    created_at: string;
}

export interface PendingInvite {
    id: string;
    group_id: string;
    email: string;
    created_at: string;
}

const mapGroup = (r: any): Group => ({
    id: r.id,
    name: r.name,
    owner_id: r.owner_id,
    created_at: r.created_at,
    members: (r.group_members ?? [])
        .map((m: any) => ({ user_id: m.user_id, joined_at: m.joined_at ?? '', role: m.role, name: m.profiles?.name ?? 'Unknown', email: m.profiles?.email ?? '' }))
        .sort((a: Member, b: Member) => (a.role !== b.role ? (a.role === 'owner' ? -1 : 1) : a.joined_at !== b.joined_at ? a.joined_at.localeCompare(b.joined_at) : a.name.localeCompare(b.name))),
});

const GROUP_SELECT = 'id, name, owner_id, created_at, group_members(user_id, role, joined_at, profiles(name, email))';

export async function listGroups(): Promise<Group[]> {
    const data = check(await supabase.from('groups').select(GROUP_SELECT).order('created_at'));
    return data.map(mapGroup);
}

export async function getGroup(id: string): Promise<Group> {
    return mapGroup(check(await supabase.from('groups').select(GROUP_SELECT).eq('id', id).single()));
}

export async function createGroup(name: string): Promise<string> {
    return check(await supabase.from('groups').insert({ name }).select('id').single()).id;
}

export async function deleteGroup(id: string) {
    check(await supabase.from('groups').delete().eq('id', id));
}

/** Used both for "leave" (own user id) and for the owner removing someone. */
export async function removeMember(groupId: string, userId: string) {
    check(await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId));
}

export async function inviteToGroup(groupId: string, email: string) {
    const { error } = await supabase.from('group_invites').insert({ group_id: groupId, email: email.trim().toLowerCase() });
    if (error) throw new Error(error.code === '23505' ? 'That email already has a pending invite.' : error.message);
}

export async function listPendingInvites(groupId: string): Promise<PendingInvite[]> {
    return check(
        await supabase.from('group_invites').select('id, group_id, email, created_at').eq('group_id', groupId).eq('status', 'pending').order('created_at')
    );
}

export async function revokeInvite(id: string) {
    check(await supabase.from('group_invites').delete().eq('id', id));
}

export async function myInvites(): Promise<Invite[]> {
    return check(await supabase.rpc('my_invites'));
}

export async function respondToInvite(id: string, accept: boolean) {
    check(await supabase.rpc('respond_to_invite', { invite_id: id, accept }));
}

// ---- Settlements (recorded payments between members) ----
export interface Settlement {
    id: string;
    group_id: string;
    from_user: string;
    to_user: string;
    amount: number;
    created_by: string;
    created_at: string;
}

export async function listSettlements(): Promise<Settlement[]> {
    const data = check(await supabase.from('settlements').select('*').order('created_at', { ascending: false }));
    return data.map((r: any) => ({ ...r, amount: Number(r.amount) }));
}

export async function recordSettlement(groupId: string, fromUser: string, toUser: string, amount: number) {
    check(await supabase.from('settlements').insert({ group_id: groupId, from_user: fromUser, to_user: toUser, amount }));
}

export async function updateSettlement(id: string, fromUser: string, toUser: string, amount: number) {
    check(await supabase.from('settlements').update({ from_user: fromUser, to_user: toUser, amount }).eq('id', id));
}

export interface SettlementLogEntry {
    id: string;
    group_id: string;
    settlement_id: string;
    action: 'created' | 'edited' | 'deleted';
    actor: string | null;
    from_user: string;
    to_user: string;
    amount: number;
    prev_from_user: string | null;
    prev_to_user: string | null;
    prev_amount: number | null;
    created_at: string;
}

/** The change history of a group's paybacks, newest first. Written by the database, never by the app. */
export async function listSettlementLog(groupId: string): Promise<SettlementLogEntry[]> {
    const data = check(await supabase.from('settlement_log').select('*').eq('group_id', groupId).order('created_at', { ascending: false }));
    return data.map((r: any) => ({ ...r, amount: Number(r.amount), prev_amount: r.prev_amount == null ? null : Number(r.prev_amount) }));
}

export async function deleteSettlement(id: string) {
    check(await supabase.from('settlements').delete().eq('id', id));
}

// ---- Admin (all enforced server-side; the UI only hides what a non-admin could not use anyway) ----
export interface AdminUser {
    id: string;
    email: string;
    name: string;
    created_at: string;
    last_sign_in_at: string | null;
    email_confirmed: boolean;
    is_admin: boolean;
    groups_count: number;
    receipts_count: number;
}

export interface AdminTotals {
    groups: number;
    receipts: number;
    items: number;
    settlements: number;
}

export async function isAdmin(): Promise<boolean> {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return false;
    const res = await supabase.from('admins').select('user_id').eq('user_id', data.user.id).maybeSingle();
    return !!res.data;
}

export async function adminListUsers(): Promise<AdminUser[]> {
    const rows = check(await supabase.rpc('admin_list_users'));
    return rows.map((r: any) => ({ ...r, groups_count: Number(r.groups_count), receipts_count: Number(r.receipts_count) }));
}

export async function adminTotals(): Promise<AdminTotals> {
    const [r] = check(await supabase.rpc('admin_totals'));
    return { groups: Number(r.groups), receipts: Number(r.receipts), items: Number(r.items), settlements: Number(r.settlements) };
}

async function adminCall<T>(body: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase.functions.invoke('admin-users', { body });
    if (error) {
        let message = error.message;
        const ctx = (error as any).context;
        if (ctx && typeof ctx.json === 'function') {
            try { message = (await ctx.json()).error ?? message; } catch { /* keep generic message */ }
        }
        throw new Error(message);
    }
    return data as T;
}

/** "Force create": the account is confirmed immediately, with no email sent. */
export function adminCreateUser(input: { name: string; email: string; password: string; confirm: boolean; makeAdmin: boolean }) {
    return adminCall<{ id: string; email: string; name: string }>({
        action: 'create', name: input.name, email: input.email, password: input.password, confirm: input.confirm, make_admin: input.makeAdmin,
    });
}

export function adminConfirmUser(userId: string) {
    return adminCall<{ ok: true }>({ action: 'confirm', user_id: userId });
}
