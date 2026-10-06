// In-memory stand-in for lib/api so the whole UI can be exercised in a browser without a backend or
// credentials: `npm run dev:mock`. Never bundled into production builds.
import type { Group, Invite, Item, PendingInvite, Session, Settlement, AdminUser, AdminTotals } from '../lib/api';

const ME = 'u-me';
const wait = <T,>(v: T, ms = 60) => new Promise<T>(r => setTimeout(() => r(v), ms));
let seq = 100;
const id = (p: string) => `${p}${seq++}`;

let groups: Group[] = [
    { id: 'g1', name: 'Roomies', owner_id: ME, created_at: '2026-01-01', members: [
        { user_id: ME, joined_at: '2026-01-01T00:00:00Z', name: 'Daven', email: 'me@example.com', role: 'owner' },
        { user_id: 'u-amy', joined_at: '2026-01-02T00:00:00Z', name: 'Amy', email: 'amy@example.com', role: 'member' },
        { user_id: 'u-bo', joined_at: '2026-01-03T00:00:00Z', name: 'Bo', email: 'bo@example.com', role: 'member' },
    ] },
    { id: 'g2', name: 'Ski Trip', owner_id: 'u-amy', created_at: '2026-02-01', members: [
        { user_id: 'u-amy', joined_at: '2026-02-01T00:00:00Z', name: 'Amy', email: 'amy@example.com', role: 'owner' },
        { user_id: ME, joined_at: '2026-02-02T00:00:00Z', name: 'Daven', email: 'me@example.com', role: 'member' },
    ] },
];
let sessions: Session[] = [
    { id: 's1', group_id: 'g1', user_id: ME, paid_by: ME, kind: 'receipt', draft: false, category: 'groceries', amount: null, split_method: null, split_data: {}, name: 'Costco', session_date: '2026-10-01', tax: 3.2, tip: 0, participants: ['Daven', 'Amy', 'Bo'], updated_at: '2026-10-01T10:00:00Z', items: [
        { id: 'i1', name: 'Oat Milk', price: 8, assigned_users: ['Daven', 'Amy'] },
        { id: 'i2', name: 'Eggs', price: 6.5, assigned_users: ['Amy', 'Bo'] },
        { id: 'i3', name: 'Chicken Breast', price: 22.4, assigned_users: [] },
    ] },
    { id: 's2', group_id: 'g1', user_id: 'u-amy', paid_by: 'u-amy', kind: 'receipt', draft: false, category: 'groceries', amount: null, split_method: null, split_data: {}, name: 'Trader Joe\'s', session_date: '2026-10-03', tax: 1, tip: 0, participants: ['Daven', 'Amy', 'Bo'], updated_at: '2026-10-03T10:00:00Z', items: [
        { id: 'i4', name: 'Pasta', price: 4, assigned_users: ['Daven', 'Amy', 'Bo'] },
    ] },
    { id: 's3', group_id: 'g1', user_id: ME, paid_by: ME, kind: 'expense', draft: false, category: 'rent', amount: 2400, split_method: 'shares', split_data: { [ME]: 2, 'u-amy': 1, 'u-bo': 1 }, name: 'October rent', session_date: '2026-10-01', tax: 0, tip: 0, participants: [], updated_at: '2026-10-01T09:00:00Z', items: [] },
];
let settlements: Settlement[] = [];
let invites: Invite[] = [{ id: 'inv1', group_id: 'g9', group_name: 'Book Club', inviter_name: 'Sam', created_at: '2026-10-04' }];
let pending: PendingInvite[] = [];

export const listGroups = () => wait(structuredClone(groups));
export const getGroup = (gid: string) => wait(structuredClone(groups.find(g => g.id === gid)!));
export const createGroup = async (name: string) => {
    const g: Group = { id: id('g'), name, owner_id: ME, created_at: new Date().toISOString(), members: [{ user_id: ME, joined_at: '2026-01-01T00:00:00Z', name: 'Daven', email: 'me@example.com', role: 'owner' }] };
    groups = [...groups, g];
    return wait(g.id);
};
export const deleteGroup = async (gid: string) => { groups = groups.filter(g => g.id !== gid); sessions = sessions.filter(s => s.group_id !== gid); return wait(undefined); };
export const removeMember = async (gid: string, uid: string) => { groups = groups.map(g => g.id === gid ? { ...g, members: g.members.filter(m => m.user_id !== uid) } : g); return wait(undefined); };
export const inviteToGroup = async (gid: string, username: string) => { pending = [...pending, { id: id('p'), group_id: gid, name: username.replace(/^@/, ''), created_at: new Date().toISOString() }]; return wait(undefined); };
export const listPendingInvites = (gid: string) => wait(pending.filter(p => p.group_id === gid));
export const revokeInvite = async (pid: string) => { pending = pending.filter(p => p.id !== pid); return wait(undefined); };
export const myInvites = () => wait(structuredClone(invites));
export const respondToInvite = async (iid: string) => { invites = invites.filter(i => i.id !== iid); return wait(undefined); };

export const listSessions = (gid?: string) => wait(structuredClone(sessions.filter(s => !gid || s.group_id === gid)));
export const getSession = (sid: string) => wait(structuredClone(sessions.find(s => s.id === sid)!));
export const createSession = async (input: any) => {
    const s: Session = { id: id('s'), group_id: input.groupId, user_id: ME, paid_by: ME, kind: input.kind ?? 'receipt', draft: !!input.draft, category: input.category ?? 'groceries', amount: input.kind === 'expense' ? input.amount ?? 0 : null, split_method: input.kind === 'expense' ? input.splitMethod ?? 'equal' : null, split_data: input.splitData ?? {}, name: input.name, session_date: input.date ?? '2026-10-05', tax: input.tax ?? 0, tip: input.tip ?? 0, participants: input.participants ?? [], updated_at: new Date().toISOString(),
        items: (input.items ?? []).map((i: any) => ({ id: id('i'), name: i.name, price: i.price, assigned_users: [] })) };
    sessions = [s, ...sessions];
    return wait(s.id);
};
export const importReceiptIntoSession = async (sid: string, input: any) => {
    sessions = sessions.map(s => s.id === sid ? { ...s, tax: s.tax + input.tax, tip: s.tip + input.tip, ...(input.date ? { session_date: input.date } : {}), name: s.name === 'Receipt' && input.store ? input.store : s.name,
        items: [...s.items, ...input.items.map((i: any) => ({ id: id('i'), name: i.name, price: i.price, assigned_users: [] }))] } : s);
    return wait(undefined);
};
export const updateSession = async (sid: string, patch: any) => { sessions = sessions.map(s => s.id === sid ? { ...s, ...patch } : s); return wait(undefined); };
export const deleteStaleDrafts = async () => wait(undefined);
export const deleteSession = async (sid: string) => { sessions = sessions.filter(s => s.id !== sid); return wait(undefined); };
export const addItem = async (sid: string, name: string, price: number): Promise<Item> => { const it = { id: id('i'), name, price, assigned_users: [] }; sessions = sessions.map(s => s.id === sid ? { ...s, items: [...s.items, it] } : s); return wait(it); };
export const updateItem = async (sid: string, iid: string, patch: any) => { sessions = sessions.map(s => s.id === sid ? { ...s, items: s.items.map(i => i.id === iid ? { ...i, ...patch } : i) } : s); return wait(undefined); };
export const deleteItem = async (sid: string, iid: string) => { sessions = sessions.map(s => s.id === sid ? { ...s, items: s.items.filter(i => i.id !== iid) } : s); return wait(undefined); };

export const listSettlements = () => wait(structuredClone(settlements));
export const recordSettlement = async (group_id: string, from_user: string, to_user: string, amount: number) => { settlements = [{ id: id('p'), group_id, from_user, to_user, amount, created_by: ME, created_at: new Date().toISOString() }, ...settlements]; return wait(undefined); };
export const deleteSettlement = async (sid: string) => { settlements = settlements.filter(s => s.id !== sid); return wait(undefined); };

export const updateDisplayName = async () => wait(undefined);
export const requestEmailChange = async () => wait(undefined);
export const changePassword = async () => wait(undefined);

export const isAdmin = () => wait(true);
const users: AdminUser[] = [
    { id: 'a', email: 'me@example.com', name: 'Daven Chang', created_at: '2026-10-01T00:00:00Z', last_sign_in_at: new Date().toISOString(), email_confirmed: true, is_admin: true, groups_count: 2, receipts_count: 2 },
    { id: 'b', email: 'amy@example.com', name: 'Amy', created_at: '2026-10-03T00:00:00Z', last_sign_in_at: null, email_confirmed: false, is_admin: false, groups_count: 2, receipts_count: 1 },
];
export const adminListUsers = () => wait(structuredClone(users));
export const adminTotals = (): Promise<AdminTotals> => wait({ groups: 2, receipts: 3, items: 9, settlements: 0 });
export const adminCreateUser = async (i: any) => wait({ id: id('u'), email: i.email, name: i.name });
export const adminConfirmUser = async () => wait({ ok: true as const });
