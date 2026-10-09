import { supabase } from './supabase';
import type { SplitData, SplitMethod } from './expenses';
import { localToday } from './people';

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
    /** How many reference photos are attached (lists only). */
    photo_count?: number;
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
    photo_count: r.session_photos?.[0]?.count ?? 0,
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
    let q = supabase.from('sessions').select('*, items(*), session_photos(count)').order('updated_at', { ascending: false });
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
    items?: { name: string; price: number; assigned_users?: string[] }[];
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
                session_date: input.date ?? localToday(),
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
            .insert(input.items.map(i => ({ session_id: s.id, name: i.name, price: i.price, ...(i.assigned_users ? { assigned_users: i.assigned_users } : {}) })));
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
    const stale = check(await supabase.from('sessions').select('id').eq('draft', true).eq('user_id', data.user.id).lt('updated_at', cutoff));
    if (!stale.length) return;
    const ids = stale.map(r => r.id);
    // A draft can have photos already; their files are not removed with the rows, so delete them first.
    await removeStoredPhotos(supabase.from('session_photos').select('path').in('session_id', ids));
    check(await supabase.from('sessions').delete().in('id', ids));
}

export async function deleteSession(id: string) {
    await removeStoredPhotos(supabase.from('session_photos').select('path').eq('session_id', id));
    check(await supabase.from('sessions').delete().eq('id', id));
}

// ---- Reference photos (up to 3 per expense; private bucket, visible to the group) ----
export interface Photo { id: string; path: string; url: string }

/** Storage files are not removed with their rows, so delete them first. Failures here must not block deleting. */
async function removeStoredPhotos(query: PromiseLike<{ data: { path: string }[] | null }>) {
    try {
        const { data } = await query;
        if (data?.length) await supabase.storage.from('receipt-photos').remove(data.map(r => r.path));
    } catch { /* orphaned files are harmless */ }
}

export async function listPhotos(sessionId: string): Promise<Photo[]> {
    const rows = check(await supabase.from('session_photos').select('id, path').eq('session_id', sessionId).order('created_at'));
    if (!rows.length) return [];
    const { data } = await supabase.storage.from('receipt-photos').createSignedUrls(rows.map(r => r.path), 3600);
    const urls = new Map((data ?? []).map(d => [d.path, d.signedUrl]));
    return rows.filter(r => urls.get(r.path)).map(r => ({ id: r.id, path: r.path, url: urls.get(r.path)! }));
}

export async function addPhoto(sessionId: string, groupId: string, file: Blob, ext = 'jpg'): Promise<void> {
    const path = `${groupId}/${sessionId}/${crypto.randomUUID()}.${ext}`;
    const up = await supabase.storage.from('receipt-photos').upload(path, file, { contentType: file.type || 'image/jpeg' });
    if (up.error) throw new Error(up.error.message);
    const { error } = await supabase.from('session_photos').insert({ session_id: sessionId, group_id: groupId, path });
    if (error) {
        await supabase.storage.from('receipt-photos').remove([path]);
        throw new Error(error.message);
    }
}

export async function removePhoto(photo: Photo): Promise<void> {
    check(await supabase.from('session_photos').delete().eq('id', photo.id));
    await supabase.storage.from('receipt-photos').remove([photo.path]);
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

/** Everything you can see that is yours, as one plain object to save as a file. Other people's emails are never included. */
export async function exportMyData() {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) throw new Error('Sign in first.');
    const [groups, sessions, settlements, quick, username] = await Promise.all([
        listGroups(), listSessions(), listSettlements(), listMyQuickSplits().catch(() => []), getMyUsername().catch(() => ''),
    ]);
    return {
        exported_at: new Date().toISOString(),
        account: { name: user.user_metadata?.name ?? '', username, email: user.email ?? '' },
        groups: groups.map(g => ({
            id: g.id, name: g.name, personal: !!g.personal, you_own_it: g.owner_id === user.id,
            members: g.members.map(m => ({ id: m.user_id, name: m.name, username: m.username ?? null, you: m.user_id === user.id, joined: !m.pending })),
        })),
        expenses: sessions.map(s => ({
            id: s.id, group_id: s.group_id, name: s.name, kind: s.kind, category: s.category, date: s.session_date, paid_by: s.paid_by,
            amount: s.amount, split_method: s.split_method, split_data: s.split_data, tax: s.tax, tip: s.tip, participants: s.participants,
            items: s.items.map(i => ({ name: i.name, price: i.price, assigned_to: i.assigned_users })),
        })),
        transfers: settlements.map(t => ({ group_id: t.group_id, from: t.from_user, to: t.to_user, amount: t.amount, date: t.created_at })),
        quick_splits: quick,
    };
}

/**
 * Delete the signed-in account. The database refuses while you own a group other people are in. Photo files of groups
 * you own are removed first (their rows go with the group, but files are not removed with rows).
 */
export async function deleteAccount() {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw new Error('Sign in first.');
    await removeStoredPhotos(supabase.from('session_photos').select('path, groups!inner(owner_id)').eq('groups.owner_id', data.user.id));
    const { error } = await supabase.rpc('delete_my_account');
    if (error) throw new Error(error.message);
}

export async function usernameAvailable(username: string): Promise<boolean> {
    return !!(await rpc('username_available', { p_username: username }));
}

export async function getMyUsername(): Promise<string> {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return '';
    const row = check(await supabase.from('profiles').select('username').eq('id', data.user.id).single());
    return row.username ?? '';
}

export async function updateUsername(username: string) {
    const u = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(u)) throw new Error('Usernames are 3 to 20 letters, numbers or underscores.');
    const { data } = await supabase.auth.getUser();
    const { error } = await supabase.from('profiles').update({ username: u }).eq('id', data.user!.id);
    if (error) throw new Error(error.code === '23505' ? 'That username is taken.' : error.message);
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
    /** Invited but not joined yet. Usable in expenses; everything moves to their account when they accept. */
    pending?: boolean;
    /** Lowercase handle people can invite by. Not set for people who haven't joined. */
    username?: string;
    /** This member has pinned the group (only meaningful on their own row). */
    pinned?: boolean;
    /** A name in your Personal section that points at a real account. Nobody is notified; it only groups what is between you. */
    linked_user?: string;
    linked_username?: string;
}

export interface Group {
    /** The user's private group for tracking what they paid for people by name. Never shared. */
    personal?: boolean;
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
    /** The invited person's display name (their email is never shown). */
    name: string;
    created_at: string;
}

const mapGroup = (r: any): Group => ({
    id: r.id,
    name: r.name,
    owner_id: r.owner_id,
    created_at: r.created_at,
    personal: !!r.personal,
    members: (r.group_members ?? [])
        .map((m: any) => ({ user_id: m.user_id, joined_at: m.joined_at ?? '', role: m.role, pinned: !!m.pinned, name: m.profiles?.name ?? 'Unknown', email: m.profiles?.email ?? '', username: m.profiles?.username ?? undefined }))
        .concat((r.group_guests ?? []).map((g: any): Member => ({ user_id: g.id, joined_at: g.created_at ?? '', role: 'member', name: g.name, email: '', pending: true, linked_user: g.linked_user ?? undefined, linked_username: g.linked_username ?? undefined })))
        .sort((a: Member, b: Member) => (!!a.pending !== !!b.pending ? (a.pending ? 1 : -1) : (a.role !== b.role ? (a.role === 'owner' ? -1 : 1) : a.joined_at !== b.joined_at ? a.joined_at.localeCompare(b.joined_at) : a.name.localeCompare(b.name)))),
});

const GROUP_SELECT = 'id, name, owner_id, created_at, personal, group_members(user_id, role, joined_at, pinned, profiles(name, email, username)), group_guests(id, name, created_at, linked_user, linked_username)';

export async function listGroups(): Promise<Group[]> {
    const data = check(await supabase.from('groups').select(GROUP_SELECT).order('created_at'));
    return data.map(mapGroup);
}

export async function getGroup(id: string): Promise<Group> {
    return mapGroup(check(await supabase.from('groups').select(GROUP_SELECT).eq('id', id).single()));
}

/** Pin or unpin a group for the signed-in user only. */
export async function setGroupPinned(groupId: string, pinned: boolean) {
    const { data } = await supabase.auth.getUser();
    check(await supabase.from('group_members').update({ pinned }).eq('group_id', groupId).eq('user_id', data.user!.id));
}

export async function createGroup(name: string): Promise<string> {
    return check(await supabase.from('groups').insert({ name }).select('id').single()).id;
}

export async function deleteGroup(id: string) {
    await removeStoredPhotos(supabase.from('session_photos').select('path').eq('group_id', id));
    check(await supabase.from('groups').delete().eq('id', id));
}

/** Used both for "leave" (own user id) and for the owner removing someone. */
export async function removeMember(groupId: string, userId: string) {
    check(await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId));
}

/** Invite by @username. They can be used in expenses while the invite is pending. With guestId, the invite is attached to that name-only person so their expenses move over on accept. */
export async function inviteToGroup(groupId: string, username: string, guestId?: string) {
    const { error } = await supabase.rpc('invite_person', { p_group: groupId, p_username: username.trim(), p_guest: guestId ?? null });
    if (error) throw new Error(error.message);
}

// ---- People who are only a name (your Personal section) or an invite not yet accepted: owner-only, enforced in the database ----
const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) throw new Error(error.message);
    return data;
};
/** A name, or (in Personal only) a username to link to that account without inviting them; the name then defaults to theirs. */
export const addGuest = (groupId: string, name: string, username?: string): Promise<string> => rpc('add_guest', { p_group: groupId, p_name: name, p_username: username?.trim() || null });
/** Personal only: point a name at an account by username (empty to unlink). Nobody is notified. */
export const linkPersonalPerson = (guestId: string, username: string) => rpc('link_personal_person', { p_guest: guestId, p_username: username });
export const renameGuest = (guestId: string, name: string) => rpc('rename_guest', { p_guest: guestId, p_name: name });
export const removeGuest = (guestId: string) => rpc('remove_guest', { p_guest: guestId });
/** The user's private Personal group (created the first time). */
export const ensurePersonalGroup = (): Promise<string> => rpc('ensure_personal_group', {});

export async function listPendingInvites(groupId: string): Promise<PendingInvite[]> {
    return check(await supabase.rpc('group_pending_invites', { p_group: groupId }));
}

export async function revokeInvite(id: string) {
    check(await supabase.rpc('revoke_invite', { p_invite: id }));
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

/** The change history of a group's transfers, newest first. Written by the database, never by the app. */
export interface MyQuickSplit {
    token: string;
    title: string;
    locked: boolean;
    people: number;
    items: number;
    total: number;
    updated_at: string;
    expires_at: string;
}

/** The signed-in user's own quick splits that have not expired (they live under Personal until they do). */
export async function listMyQuickSplits(): Promise<MyQuickSplit[]> {
    const data = check(await supabase.rpc('my_quick_splits'));
    return data.map((r: any) => ({ ...r, total: Number(r.total) }));
}

export interface ExpenseLogEntry {
    id: string;
    group_id: string;
    session_id: string;
    action: 'created' | 'edited' | 'deleted';
    actor: string | null;
    kind: 'receipt' | 'expense';
    name: string;
    total: number;
    /** What changed on an edit, as raw values: [{ field: 'amount', from: 20, to: 25 }, ...]. */
    changes: { field: string; from?: any; to?: any; added?: string[]; removed?: string[]; changed?: string[] }[];
    created_at: string;
}

/** Every expense and receipt created, edited or deleted in a group, newest first. Written by the database. */
export async function listExpenseLog(groupId: string): Promise<ExpenseLogEntry[]> {
    const data = check(await supabase.from('expense_log').select('*').eq('group_id', groupId).order('created_at', { ascending: false }));
    return data.map((r: any) => ({ ...r, total: Number(r.total), changes: r.changes ?? [] }));
}

/** Save a receipt's details and its items together, atomically, as one edit. Items without an id are new. */
export async function saveReceipt(
    sessionId: string,
    patch: { name?: string; session_date?: string; tax?: number; tip?: number; category?: string; paid_by?: string | null },
    items: { id?: string; name: string; price: number; assigned_users: string[] }[]
) {
    const { error } = await supabase.rpc('save_receipt', { p_session: sessionId, p_patch: patch, p_items: items.map(i => ({ ...i, id: i.id ?? null })) });
    if (error) throw new Error(error.message);
}

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
