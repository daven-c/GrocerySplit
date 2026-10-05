import { supabase } from './supabase';

export interface Item {
    id: string;
    name: string;
    price: number;
    assigned_users: string[];
}

export interface Session {
    id: string;
    group_id: string;
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

export async function updateSession(
    id: string,
    patch: Partial<Pick<Session, 'name' | 'session_date' | 'tax' | 'tip' | 'participants'>>
) {
    check(await supabase.from('sessions').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id));
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
        .map((m: any) => ({ user_id: m.user_id, role: m.role, name: m.profiles?.name ?? 'Unknown', email: m.profiles?.email ?? '' }))
        .sort((a: Member, b: Member) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'owner' ? -1 : 1)),
});

const GROUP_SELECT = 'id, name, owner_id, created_at, group_members(user_id, role, profiles(name, email))';

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
