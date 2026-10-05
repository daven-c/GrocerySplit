// Shared mocks and fixtures for component tests. Test files install them with:
//   vi.mock('../../lib/api', async () => (await import('../../test/apiMock')).apiMock)
//   vi.mock('../../lib/supabase', async () => (await import('../../test/apiMock')).supabaseModule)
import { vi } from 'vitest';

export const ME = 'u-me';
export const members = [
    { user_id: ME, joined_at: '2026-01-01T00:00:00Z', name: 'Daven', email: 'me@x.com', role: 'owner' as const },
    { user_id: 'u-amy', joined_at: '2026-01-02T00:00:00Z', name: 'Amy', email: 'amy@x.com', role: 'member' as const },
    { user_id: 'u-bo', joined_at: '2026-01-03T00:00:00Z', name: 'Bo', email: 'bo@x.com', role: 'member' as const },
];
export const group = { id: 'g1', name: 'Roomies', owner_id: ME, created_at: '2026-01-01', members };
export const otherGroup = {
    id: 'g2', name: 'Ski Trip', owner_id: 'u-amy', created_at: '2026-02-01',
    members: [{ user_id: 'u-amy', joined_at: '2026-02-01T00:00:00Z', name: 'Amy', email: 'amy@x.com', role: 'owner' as const }, { user_id: ME, joined_at: '2026-02-02T00:00:00Z', name: 'Daven', email: 'me@x.com', role: 'member' as const }],
};

const base = { group_id: 'g1', user_id: ME, tax: 0, tip: 0, participants: ['Daven', 'Amy', 'Bo'], updated_at: '2026-10-05T10:00:00Z', amount: null, split_method: null, split_data: {} };
export const receipt = {
    ...base, id: 's1', kind: 'receipt' as const, category: 'groceries', paid_by: ME, name: 'Costco', session_date: '2026-10-01', tax: 3.2,
    items: [
        { id: 'i1', name: 'Oat Milk', price: 8, assigned_users: ['Daven', 'Amy'] },
        { id: 'i2', name: 'Eggs', price: 6.5, assigned_users: ['Amy', 'Bo'] },
        { id: 'i3', name: 'Chicken Breast', price: 22.4, assigned_users: [] },
    ],
};
export const rent = {
    ...base, id: 's2', kind: 'expense' as const, category: 'rent', paid_by: ME, name: 'October rent', session_date: '2026-10-01', items: [],
    amount: 2400, split_method: 'shares' as const, split_data: { [ME]: 2, 'u-amy': 1, 'u-bo': 1 },
};
export const dinner = {
    ...base, id: 's3', kind: 'expense' as const, category: 'dining', paid_by: 'u-amy', name: 'Pizza night', session_date: '2026-09-20', items: [],
    amount: 60, split_method: 'equal' as const, split_data: { [ME]: 1, 'u-amy': 1 },
};
// Balances with me: Amy owes 8.85 + 600 - 30 = 578.85, Bo owes 3.97 + 600 = 603.97 (total owed 1,182.82)
export const sessions = [receipt, rent, dinner];

export const apiMock = {
    listGroups: vi.fn(), listSessions: vi.fn(), listSettlements: vi.fn(), myInvites: vi.fn(), respondToInvite: vi.fn(),
    createGroup: vi.fn(), isAdmin: vi.fn(), getGroup: vi.fn(), getSession: vi.fn(), createSession: vi.fn(),
    deleteGroup: vi.fn(), removeMember: vi.fn(), inviteToGroup: vi.fn(), listPendingInvites: vi.fn(), revokeInvite: vi.fn(),
    recordSettlement: vi.fn(), deleteSettlement: vi.fn(), updateSession: vi.fn(), updateItem: vi.fn(), addItem: vi.fn(),
    deleteItem: vi.fn(), deleteSession: vi.fn(), updateDisplayName: vi.fn(), requestEmailChange: vi.fn(), changePassword: vi.fn(),
    adminListUsers: vi.fn(), adminTotals: vi.fn(), adminCreateUser: vi.fn(), adminConfirmUser: vi.fn(),
};

export const authMock = {
    getSession: vi.fn(), onAuthStateChange: vi.fn(),
    getUser: vi.fn(async () => ({ data: { user: { id: ME } } })),
    signInWithPassword: vi.fn(async (_a?: any) => ({ error: null as any })),
    signUp: vi.fn(async (_a?: any) => ({ data: { session: null as any }, error: null as any })),
    signOut: vi.fn(async () => ({ error: null })),
};
export const supabaseModule = {
    supabase: {
        auth: {
            getSession: () => authMock.getSession(),
            onAuthStateChange: (cb: any) => authMock.onAuthStateChange(cb),
            getUser: () => authMock.getUser(),
            signInWithPassword: (a: any) => authMock.signInWithPassword(a),
            signUp: (a: any) => authMock.signUp(a),
            signOut: () => authMock.signOut(),
        },
    },
};

/** Call in beforeEach: clears mocks and installs happy-path defaults. */
export function resetMocks() {
    vi.clearAllMocks();
    window.scrollTo = vi.fn() as any;
    (window as any).matchMedia = (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    const clone = <T,>(v: T): T => structuredClone(v);
    apiMock.listGroups.mockImplementation(async () => clone([group, otherGroup]));
    apiMock.listSessions.mockImplementation(async () => clone(sessions));
    apiMock.listSettlements.mockResolvedValue([]);
    apiMock.myInvites.mockResolvedValue([]);
    apiMock.isAdmin.mockResolvedValue(false);
    apiMock.getGroup.mockImplementation(async (id: string) => clone(id === 'g2' ? otherGroup : group));
    apiMock.getSession.mockImplementation(async (id: string) => clone(sessions.find(s => s.id === id)!));
    apiMock.listPendingInvites.mockResolvedValue([]);
    apiMock.adminTotals.mockResolvedValue({ groups: 2, receipts: 5, items: 30, settlements: 1 });
    apiMock.adminListUsers.mockResolvedValue([
        { id: 'a', email: 'ddchang@x.com', name: 'Daven', created_at: '2026-10-01T00:00:00Z', last_sign_in_at: new Date().toISOString(), email_confirmed: true, is_admin: true, groups_count: 2, receipts_count: 4 },
        { id: 'b', email: 'pending@x.com', name: 'Pending', created_at: '2026-10-04T00:00:00Z', last_sign_in_at: null, email_confirmed: false, is_admin: false, groups_count: 0, receipts_count: 0 },
    ]);
    for (const k of ['respondToInvite', 'deleteGroup', 'removeMember', 'inviteToGroup', 'revokeInvite', 'recordSettlement', 'deleteSettlement', 'updateSession', 'updateItem', 'deleteItem', 'deleteSession', 'updateDisplayName', 'requestEmailChange', 'changePassword', 'adminConfirmUser'] as const) apiMock[k].mockResolvedValue(undefined);
    apiMock.createGroup.mockResolvedValue('g9');
    apiMock.createSession.mockResolvedValue('s9');
    apiMock.addItem.mockResolvedValue({ id: 'i9', name: 'New item', price: 0, assigned_users: [] });
    apiMock.adminCreateUser.mockResolvedValue({ id: 'c', email: 'new@x.com', name: 'New' });
    authMock.getSession.mockResolvedValue({ data: { session: null } });
    authMock.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe() {} } } });
    authMock.getUser.mockResolvedValue({ data: { user: { id: ME } } });
}

export const signedInSession = { user: { id: ME, email: 'me@x.com', user_metadata: { name: 'Daven Chang' } } };
