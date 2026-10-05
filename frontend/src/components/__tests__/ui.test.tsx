// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

// ---- fixtures ----
const ME = 'u-me';
const members = [
    { user_id: ME, name: 'Me', email: 'me@x.com', role: 'owner' as const },
    { user_id: 'u-amy', name: 'Amy', email: 'amy@x.com', role: 'member' as const },
];
const group = { id: 'g1', name: 'Roomies', owner_id: ME, created_at: '2026-01-01', members };
const mkSession = (over: any = {}) => ({
    id: 's1', group_id: 'g1', user_id: ME, paid_by: ME, name: 'Corner Market', session_date: '2026-10-05',
    tax: 1, tip: 0, participants: ['Me', 'Amy'], updated_at: '2026-10-05T10:00:00Z',
    items: [
        { id: 'i1', name: 'Oat Milk', price: 8, assigned_users: ['Me', 'Amy'] },
        { id: 'i2', name: 'Eggs', price: 6, assigned_users: [] },
    ],
    ...over,
});

const api = vi.hoisted(() => ({
    listGroups: vi.fn(), listSessions: vi.fn(), listSettlements: vi.fn(), myInvites: vi.fn(), respondToInvite: vi.fn(),
    createGroup: vi.fn(), isAdmin: vi.fn(), getGroup: vi.fn(), getSession: vi.fn(), createSession: vi.fn(),
    deleteGroup: vi.fn(), removeMember: vi.fn(), inviteToGroup: vi.fn(), listPendingInvites: vi.fn(), revokeInvite: vi.fn(),
    recordSettlement: vi.fn(), deleteSettlement: vi.fn(), updateSession: vi.fn(), updateItem: vi.fn(), addItem: vi.fn(),
    deleteItem: vi.fn(), deleteSession: vi.fn(), updateDisplayName: vi.fn(), requestEmailChange: vi.fn(), changePassword: vi.fn(),
    adminListUsers: vi.fn(), adminTotals: vi.fn(), adminCreateUser: vi.fn(), adminConfirmUser: vi.fn(),
}));
vi.mock('../../lib/api', () => api);
const authMock = vi.hoisted(() => ({ getSession: vi.fn(), onAuthStateChange: vi.fn() }));
vi.mock('../../lib/supabase', () => ({
    supabase: {
        auth: {
            getUser: async () => ({ data: { user: { id: ME } } }),
            getSession: () => authMock.getSession(),
            onAuthStateChange: (cb: any) => authMock.onAuthStateChange(cb),
            signInWithPassword: vi.fn(async () => ({ error: null })),
            signUp: vi.fn(async () => ({ data: { session: null }, error: null })),
            signOut: vi.fn(),
        },
    },
}));

import Dashboard from '../Dashboard';
import GroupDetail from '../GroupDetail';
import FriendsTab from '../FriendsTab';
import Split from '../Split';
import Admin from '../Admin';
import Account from '../Account';
import Auth from '../Auth';
import ReceiptUpload from '../ReceiptUpload';
import App from '../../App';
import ErrorBoundary from '../ErrorBoundary';

afterEach(cleanup);

beforeEach(() => {
    vi.clearAllMocks();
    window.scrollTo = vi.fn() as any;
    authMock.getSession.mockResolvedValue({ data: { session: null } });
    authMock.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe() {} } } });
    (window as any).matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    api.listGroups.mockResolvedValue([group]);
    api.listSessions.mockResolvedValue([mkSession()]);
    api.listSettlements.mockResolvedValue([]);
    api.myInvites.mockResolvedValue([]);
    api.isAdmin.mockResolvedValue(false);
    api.getGroup.mockResolvedValue(group);
    api.getSession.mockResolvedValue(mkSession());
    api.listPendingInvites.mockResolvedValue([]);
    api.adminTotals.mockResolvedValue({ groups: 2, receipts: 5, items: 30, settlements: 1 });
    api.adminListUsers.mockResolvedValue([
        { id: 'a', email: 'ddchang@x.com', name: 'Daven', created_at: '2026-10-01T00:00:00Z', last_sign_in_at: new Date().toISOString(), email_confirmed: true, is_admin: true, groups_count: 2, receipts_count: 4 },
        { id: 'b', email: 'pending@x.com', name: 'Pending', created_at: '2026-10-04T00:00:00Z', last_sign_in_at: null, email_confirmed: false, is_admin: false, groups_count: 0, receipts_count: 0 },
    ]);
    for (const k of ['respondToInvite', 'createGroup', 'removeMember', 'deleteGroup', 'recordSettlement', 'deleteSettlement', 'updateSession', 'updateItem', 'deleteSession', 'updateDisplayName', 'changePassword', 'adminConfirmUser', 'requestEmailChange']) (api as any)[k].mockResolvedValue(undefined);
    api.adminCreateUser.mockResolvedValue({ id: 'c', email: 'new@x.com', name: 'New' });
    api.addItem.mockResolvedValue({ id: 'i3', name: 'New Manual Item', price: 0, assigned_users: [] });
    api.createGroup.mockResolvedValue('g2');
    api.createSession.mockResolvedValue('s2');
});

const user = () => userEvent.setup();

describe('Dashboard', () => {
    const props = { user: { id: ME, name: 'Daven Chang', email: 'me@x.com' }, onOpenGroup: vi.fn(), onOpenAccount: vi.fn(), onOpenAdmin: vi.fn(), onLogout: vi.fn() };

    it('lists groups, opens one, and creates a new group', async () => {
        const u = user();
        render(<Dashboard {...props} />);
        expect(await screen.findByText('Roomies')).toBeInTheDocument();
        await u.click(screen.getByText('Roomies'));
        expect(props.onOpenGroup).toHaveBeenCalledWith('g1');
        await u.type(screen.getByPlaceholderText('New group...'), 'Trip');
        await u.click(screen.getByLabelText('Create group'));
        await waitFor(() => expect(api.createGroup).toHaveBeenCalledWith('Trip'));
        expect(props.onOpenGroup).toHaveBeenCalledWith('g2');
    });

    it('switches between Groups and Friends tabs', async () => {
        const u = user();
        render(<Dashboard {...props} />);
        await screen.findByText('Roomies');
        await u.click(screen.getByRole('tab', { name: 'Friends' }));
        expect(await screen.findByText('Amy')).toBeInTheDocument();
        await waitFor(() => expect(screen.queryByText('Roomies')).not.toBeInTheDocument());
        await u.click(screen.getByRole('tab', { name: 'Groups' }));
        expect(await screen.findByText('Roomies')).toBeInTheDocument();
    });

    it('menu opens and closes, shows Admin only for admins, and navigates', async () => {
        const u = user();
        render(<Dashboard {...props} />);
        await screen.findByText('Roomies');
        await u.click(screen.getByLabelText('Menu'));
        expect(await screen.findByText('Account')).toBeInTheDocument();
        expect(screen.queryByText('Admin')).not.toBeInTheDocument();
        await u.click(screen.getByText('Account'));
        expect(props.onOpenAccount).toHaveBeenCalled();
        await waitFor(() => expect(screen.queryByText('Sign out')).not.toBeInTheDocument());

        api.isAdmin.mockResolvedValue(true);
        const second = render(<Dashboard {...props} />);
        await u.click(within(second.container).getByLabelText('Menu'));
        await u.click(await within(second.container).findByText('Admin'));
        expect(props.onOpenAdmin).toHaveBeenCalled();
    });

    it('shows invitations and answers them', async () => {
        const u = user();
        api.myInvites.mockResolvedValue([{ id: 'inv1', group_id: 'g9', group_name: 'Ski Trip', inviter_name: 'Sam', created_at: '2026-10-05' }]);
        render(<Dashboard {...props} />);
        expect(await screen.findByText('Ski Trip')).toBeInTheDocument();
        await u.click(screen.getByRole('button', { name: 'Join' }));
        await waitFor(() => expect(api.respondToInvite).toHaveBeenCalledWith('inv1', true));
    });
});

describe('FriendsTab', () => {
    it('shows balances, expands a friend, and records a settlement', async () => {
        const u = user();
        const onChanged = vi.fn();
        render(<FriendsTab me={ME} groups={[group]} sessions={[mkSession()]} settlements={[]} onChanged={onChanged} />);
        // Me paid; Amy's half of Oat Milk (4) + her share of tax (0.50) = owes me 4.50
        await u.click(await screen.findByText('Amy'));
        expect(await screen.findByText(/Amy owes you \$4\.50/)).toBeInTheDocument();
        await u.click(screen.getByRole('button', { name: 'Mark received' }));
        await waitFor(() => expect(api.recordSettlement).toHaveBeenCalledWith('g1', 'u-amy', ME, expect.closeTo(4.5, 2)));
        expect(onChanged).toHaveBeenCalled();
    });

    it('lists recorded payments and undoes the ones you made', async () => {
        const u = user();
        const settlements = [{ id: 'p1', group_id: 'g1', from_user: 'u-amy', to_user: ME, amount: 2, created_by: ME, created_at: '2026-10-05T00:00:00Z' }];
        render(<FriendsTab me={ME} groups={[group]} sessions={[mkSession()]} settlements={settlements} onChanged={vi.fn()} />);
        await u.click(await screen.findByText('Amy'));
        expect(await screen.findByText(/Amy paid you \$2\.00/)).toBeInTheDocument();
        await u.click(screen.getByRole('button', { name: 'Undo' }));
        await waitFor(() => expect(api.deleteSettlement).toHaveBeenCalledWith('p1'));
    });

    it('shows an empty state without friends', async () => {
        render(<FriendsTab me={ME} groups={[{ ...group, members: [members[0]] }]} sessions={[]} settlements={[]} onChanged={vi.fn()} />);
        expect(await screen.findByText('No friends yet.')).toBeInTheDocument();
    });
});

describe('GroupDetail', () => {
    const props = { groupId: 'g1', onBack: vi.fn(), onImport: vi.fn(), onOpenReceipt: vi.fn() };

    it('shows receipts, searches them, and opens one', async () => {
        const u = user();
        render(<GroupDetail {...props} />);
        expect(await screen.findByText('Corner Market')).toBeInTheDocument();
        await u.type(screen.getByPlaceholderText(/Search receipts/), 'zzz');
        expect(await screen.findByText('No matching receipts.')).toBeInTheDocument();
        await u.clear(screen.getByPlaceholderText(/Search receipts/));
        await u.click(await screen.findByText('Corner Market'));
        expect(props.onOpenReceipt).toHaveBeenCalledWith('s1');
        await u.click(screen.getByText('Import Receipt'));
        expect(props.onImport).toHaveBeenCalledWith('g1');
    });

    it('manual receipt creates one in the group with everyone on it', async () => {
        const u = user();
        render(<GroupDetail {...props} />);
        await u.click(await screen.findByText('Manual Receipt'));
        await waitFor(() => expect(api.createSession).toHaveBeenCalledWith({ groupId: 'g1', name: 'Manual Receipt', participants: ['Me', 'Amy'] }));
    });

    it('members tab: invites by email, validates, and the owner can remove a member via the confirm dialog', async () => {
        const u = user();
        render(<GroupDetail {...props} />);
        await screen.findByText('Corner Market');
        await u.click(screen.getByRole('tab', { name: /Members/ }));
        const email = await screen.findByPlaceholderText('friend@example.com');
        await u.type(email, 'not-an-email');
        await u.click(screen.getByRole('button', { name: 'Invite' }));
        expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
        await u.clear(email);
        await u.type(email, 'New@Example.com');
        await u.click(screen.getByRole('button', { name: 'Invite' }));
        await waitFor(() => expect(api.inviteToGroup).toHaveBeenCalledWith('g1', 'new@example.com'));

        await u.click(screen.getByLabelText('Remove Amy'));
        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByText('Remove member?')).toBeInTheDocument();
        await u.click(within(dialog).getByRole('button', { name: 'Cancel' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(api.removeMember).not.toHaveBeenCalled();

        await u.click(screen.getByLabelText('Remove Amy'));
        await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove' }));
        await waitFor(() => expect(api.removeMember).toHaveBeenCalledWith('g1', 'u-amy'));
    });

    it('delete group asks for confirmation and Escape dismisses the dialog', async () => {
        const u = user();
        render(<GroupDetail {...props} />);
        await screen.findByText('Corner Market');
        await u.click(screen.getByRole('tab', { name: /Members/ }));
        await u.click(await screen.findByRole('button', { name: 'Delete group' }));
        expect(await screen.findByRole('dialog')).toBeInTheDocument();
        await u.keyboard('{Escape}');
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(api.deleteGroup).not.toHaveBeenCalled();
    });
});

describe('Split (receipt editor)', () => {
    it('has Items and Settings tabs only (no Members tab) and everyone in the group is on the receipt', async () => {
        render(<Split sessionId="s1" onBack={vi.fn()} />);
        expect(await screen.findByText('Oat Milk')).toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: 'Members' })).not.toBeInTheDocument();
        expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(expect.arrayContaining(['Items', 'Settings']));
        expect(screen.getAllByText('Amy').length).toBeGreaterThan(0);
    });

    it('toggling an assignment saves it', async () => {
        const u = user();
        render(<Split sessionId="s1" onBack={vi.fn()} />);
        await screen.findByText('Eggs');
        // Eggs is unassigned; the first avatar button in its row belongs to "Me"
        const row = screen.getByText('Eggs').closest('div[class*="rounded-2xl"]') as HTMLElement;
        const avatars = within(row).getAllByRole('button').filter(b => b.textContent === 'M' || b.textContent === 'A');
        await u.click(avatars[0]);
        await waitFor(() => expect(api.updateItem).toHaveBeenCalledWith('s1', 'i2', { assigned_users: ['Me'] }));
    });

    it('settings: Paid by, save, and delete receipt confirmation', async () => {
        const u = user();
        const onBack = vi.fn();
        render(<Split sessionId="s1" onBack={onBack} />);
        await screen.findByText('Oat Milk');
        await u.click(screen.getByRole('tab', { name: 'Settings' }));
        const paidBy = await screen.findByDisplayValue('Me');
        await u.selectOptions(paidBy, 'Amy');
        await u.click(screen.getByRole('button', { name: /Save Receipt Settings/ }));
        await waitFor(() => expect(api.updateSession).toHaveBeenCalledWith('s1', expect.objectContaining({ paid_by: 'u-amy' })));
        expect(await screen.findByText('Receipt saved successfully!')).toBeInTheDocument();

        await u.click(screen.getByRole('button', { name: /Delete Receipt/ }));
        const dialog = await screen.findByRole('dialog');
        await u.click(within(dialog).getByRole('button', { name: 'Cancel' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(api.deleteSession).not.toHaveBeenCalled();
        await u.click(screen.getByRole('button', { name: /Delete Receipt/ }));
        await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }));
        await waitFor(() => expect(api.deleteSession).toHaveBeenCalledWith('s1'));
        expect(onBack).toHaveBeenCalled();
    });

    it('shows the correct per-person totals including tax', async () => {
        render(<Split sessionId="s1" onBack={vi.fn()} />);
        await screen.findByText('Oat Milk');
        // Oat Milk 8 split two ways, tax 1 split in proportion: Me 4.50, Amy 4.50
        await waitFor(() => expect(screen.getAllByText('$4.50').length).toBeGreaterThanOrEqual(2), { timeout: 3000 });
    });
});

describe('Admin', () => {
    it('lists users with stats, filters, and force-confirms a pending one', async () => {
        const u = user();
        render(<Admin onBack={vi.fn()} />);
        expect(await screen.findByText('Daven')).toBeInTheDocument();
        expect(screen.getByText('Pending')).toBeInTheDocument();
        expect(screen.getByText('Admin', { selector: 'span' })).toBeInTheDocument();
        await u.type(screen.getByPlaceholderText(/Search name or email/), 'pend');
        await waitFor(() => expect(screen.queryByText('Daven')).not.toBeInTheDocument());
        await u.click(screen.getByRole('button', { name: 'Force confirm' }));
        await waitFor(() => expect(api.adminConfirmUser).toHaveBeenCalledWith('b'));
    });

    it('create-user form expands, force creates, and shows the credentials once', async () => {
        const u = user();
        render(<Admin onBack={vi.fn()} />);
        await screen.findByText('Daven');
        await u.click(screen.getByRole('button', { name: /Create user/ }));
        await u.type(await screen.findByPlaceholderText('Display name'), 'New');
        await u.type(screen.getByPlaceholderText('Email'), 'new@x.com');
        await u.click(screen.getByRole('button', { name: 'Generate' }));
        const pw = (screen.getByPlaceholderText(/Temporary password/) as HTMLInputElement).value;
        expect(pw).toHaveLength(16);
        await u.click(screen.getAllByRole('button', { name: 'Create user' }).pop()!);
        await waitFor(() => expect(api.adminCreateUser).toHaveBeenCalledWith({ name: 'New', email: 'new@x.com', password: pw, confirm: true, makeAdmin: false }));
        expect(await screen.findByText(/User created/)).toBeInTheDocument();
    });

    it('shows a friendly message to non-admins', async () => {
        api.adminListUsers.mockRejectedValue(new Error('Not authorized'));
        render(<Admin onBack={vi.fn()} />);
        expect(await screen.findByText('You do not have admin access.')).toBeInTheDocument();
    });
});

describe('Account', () => {
    const props = { user: { id: ME, name: 'Daven', email: 'me@x.com' }, onBack: vi.fn(), onLogout: vi.fn() };

    it('saves a new display name', async () => {
        const u = user();
        render(<Account {...props} />);
        const input = await screen.findByDisplayValue('Daven');
        await u.clear(input);
        await u.type(input, 'Dave');
        await u.click(screen.getByRole('button', { name: 'Save name' }));
        await waitFor(() => expect(api.updateDisplayName).toHaveBeenCalledWith('Dave'));
        expect(await screen.findByText('Name updated.')).toBeInTheDocument();
    });

    it('password form validates then submits', async () => {
        const u = user();
        render(<Account {...props} />);
        const [cur, next, confirm] = Array.from(document.querySelectorAll('input[type="password"]')) as HTMLInputElement[];
        await u.type(cur, 'old-password');
        await u.type(next, 'newpassword1');
        await u.type(confirm, 'different1');
        await u.click(screen.getByRole('button', { name: 'Change password' }));
        expect(await screen.findByText('New passwords do not match.')).toBeInTheDocument();
        expect(api.changePassword).not.toHaveBeenCalled();
        await u.clear(confirm);
        await u.type(confirm, 'newpassword1');
        await u.click(screen.getByRole('button', { name: 'Change password' }));
        await waitFor(() => expect(api.changePassword).toHaveBeenCalledWith('old-password', 'newpassword1'));
        expect(await screen.findByText('Password changed.')).toBeInTheDocument();
    });

    it('requests an email change and can sign out', async () => {
        const u = user();
        render(<Account {...props} />);
        await u.type(screen.getByPlaceholderText('new@example.com'), 'next@x.com');
        await u.click(screen.getByRole('button', { name: 'Change email' }));
        await waitFor(() => expect(api.requestEmailChange).toHaveBeenCalledWith('next@x.com'));
        expect(await screen.findByText(/Confirmation sent/)).toBeInTheDocument();
        await u.click(screen.getByRole('button', { name: /Sign Out/ }));
        expect(props.onLogout).toHaveBeenCalled();
    });
});

describe('Auth + App shell', () => {
    it('sign up reveals the name field, login hides it', async () => {
        const u = user();
        render(<Auth onLogin={vi.fn()} />);
        expect(screen.queryByPlaceholderText('Your Name')).not.toBeInTheDocument();
        await u.click(screen.getByRole('tab', { name: 'Sign Up' }));
        expect(await screen.findByPlaceholderText('Your Name')).toBeInTheDocument();
        await u.click(screen.getByRole('tab', { name: 'Login' }));
        await waitFor(() => expect(screen.queryByPlaceholderText('Your Name')).not.toBeInTheDocument());
    });

    it('password visibility toggle works', async () => {
        const u = user();
        render(<Auth onLogin={vi.fn()} />);
        const pw = screen.getByPlaceholderText('••••••••') as HTMLInputElement;
        expect(pw.type).toBe('password');
        await u.click(screen.getByLabelText('Show password'));
        expect(pw.type).toBe('text');
    });

    it('App renders the sign-in screen when signed out', async () => {
        render(<App />);
        expect(await screen.findByText('Precise, simple shared expenses.')).toBeInTheDocument();
    });

    it('App shows the dashboard when a session is restored', async () => {
        authMock.getSession.mockResolvedValue({ data: { session: { user: { id: ME, email: 'me@x.com', user_metadata: { name: 'Daven Chang' } } } } });
        render(<App />);
        expect(await screen.findByText('Roomies')).toBeInTheDocument();
        expect(screen.getByText(/Welcome back, Daven/)).toBeInTheDocument();
    });

    it('App never stays blank: a failed session restore falls back to sign-in', async () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        authMock.getSession.mockRejectedValue(new Error('Lock timed out'));
        render(<App />);
        expect(await screen.findByText('Precise, simple shared expenses.')).toBeInTheDocument();
        spy.mockRestore();
    });

    it('App never stays blank: a hung session restore times out to sign-in, and a late session still reaches the app', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        let listener: any;
        authMock.getSession.mockReturnValue(new Promise(() => {}));
        authMock.onAuthStateChange.mockImplementation((cb: any) => { listener = cb; return { data: { subscription: { unsubscribe() {} } } }; });
        render(<App />);
        expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
        await vi.advanceTimersByTimeAsync(6100);
        expect(await screen.findByText('Precise, simple shared expenses.')).toBeInTheDocument();
        listener('SIGNED_IN', { user: { id: ME, email: 'me@x.com', user_metadata: { name: 'Daven' } } });
        expect(await screen.findByText('Roomies')).toBeInTheDocument();
        warn.mockRestore();
        vi.useRealTimers();
    });

    it('ErrorBoundary shows a reload option instead of a blank page', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const Boom = () => { throw new Error('boom'); };
        render(<ErrorBoundary><Boom /></ErrorBoundary>);
        expect(screen.getByText('Something went wrong')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
        spy.mockRestore();
    });
});

describe('ReceiptUpload', () => {
    it('previews valid JSON, rejects invalid JSON, and imports into the group with everyone on it', async () => {
        const u = user();
        const onImported = vi.fn();
        render(<ReceiptUpload groupId="g1" onImported={onImported} onBack={vi.fn()} />);
        const box = screen.getByRole('textbox');
        fireEvent.change(box, { target: { value: 'not json' } });
        expect(await screen.findByText(/not valid JSON/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Import & split' })).toBeDisabled();
        await u.click(screen.getByRole('button', { name: 'Try example' }));
        expect(await screen.findByText(/3 items/)).toBeInTheDocument();
        await u.click(screen.getByRole('button', { name: 'Import & split' }));
        await waitFor(() => expect(api.createSession).toHaveBeenCalledWith(expect.objectContaining({ groupId: 'g1', participants: ['Me', 'Amy'], name: 'Corner Market' })));
        expect(onImported).toHaveBeenCalledWith('s2');
    });
});
