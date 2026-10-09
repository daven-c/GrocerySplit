// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

vi.mock('../../lib/api', async () => (await import('../../test/apiMock')).apiMock);
vi.mock('../../lib/supabase', async () => (await import('../../test/apiMock')).supabaseModule);

import { apiMock as api, resetMocks, ME, sessions } from '../../test/apiMock';
import { renderWithData } from '../../test/render';
import Friends from '../Friends';
import Account from '../Account';
import Admin from '../Admin';

beforeEach(resetMocks);
afterEach(cleanup);

describe('Friends', () => {
    it('shows owed totals, and friends sorted by what is outstanding, with their shared groups', async () => {
        renderWithData(<Friends />);
        expect(await screen.findByRole('heading', { name: 'People' })).toBeInTheDocument();
        await waitFor(() => expect(screen.getByText('$1,182.82')).toBeInTheDocument(), { timeout: 3000 });
        const rows = screen.getAllByRole('button', { expanded: false });
        expect(rows[0]).toHaveTextContent('Bo');
        expect(rows[0]).toHaveTextContent('$603.97');
        expect(rows[0]).toHaveTextContent('@bo_b'); // the username tells two people with the same name apart
        expect(rows[0]).toHaveTextContent('owes you');
        expect(rows[1]).toHaveTextContent('Amy');
        expect(rows[1]).toHaveTextContent('Roomies, Ski Trip');
        expect(rows[1]).toHaveTextContent('$578.85');
    });

    it('expands a friend, marks a payment received, and refreshes', async () => {
        const u = userEvent.setup();
        renderWithData(<Friends />);
        await u.click(await screen.findByRole('button', { name: /Amy/ }));
        expect(await screen.findByText('Amy owes Daven $578.85')).toBeInTheDocument();
        expect(screen.getByText("Marking something paid doesn't move money. It just clears the balance for both of you.")).toBeInTheDocument();
        await u.click(screen.getByRole('button', { name: 'Mark received' }));
        await waitFor(() => expect(api.recordSettlement).toHaveBeenCalledWith('g1', 'u-amy', ME, expect.closeTo(578.85, 2)));
        await waitFor(() => expect(api.listSessions.mock.calls.length).toBeGreaterThan(1)); // refreshed
    });

    it('when you owe, it says so and records you paying', async () => {
        const u = userEvent.setup();
        api.listSessions.mockResolvedValue([sessions[2]]); // Pizza night: Amy paid, you owe her 30
        renderWithData(<Friends />);
        await u.click(await screen.findByRole('button', { name: /Amy/ }));
        expect(await screen.findByText('Daven owes Amy $30.00')).toBeInTheDocument();
        expect(screen.getByText('you owe')).toBeInTheDocument();
        expect(screen.getByText('-$30.00')).toBeInTheDocument(); // down: shown negative
        await u.click(screen.getByRole('button', { name: 'Mark paid' }));
        await waitFor(() => expect(api.recordSettlement).toHaveBeenCalledWith('g1', ME, 'u-amy', 30));
    });

    it('settles everything across groups with one friend', async () => {
        const u = userEvent.setup();
        const skiCost = { ...sessions[2], id: 's7', group_id: 'g2', paid_by: ME, split_data: { [ME]: 1, 'u-amy': 1 }, amount: 100 };
        api.listSessions.mockResolvedValue([sessions[1], skiCost]);
        renderWithData(<Friends />);
        await u.click(await screen.findByRole('button', { name: /Amy/ }));
        await u.click(await screen.findByRole('button', { name: 'Settle everything with Amy' }));
        await waitFor(() => expect(api.recordSettlement).toHaveBeenCalledTimes(2));
        expect(api.recordSettlement).toHaveBeenCalledWith('g1', 'u-amy', ME, 600);
        expect(api.recordSettlement).toHaveBeenCalledWith('g2', 'u-amy', ME, 50);
    });

    it('lists recorded payments and lets you undo your own', async () => {
        const u = userEvent.setup();
        api.listSettlements.mockResolvedValue([
            { id: 'p1', group_id: 'g1', from_user: 'u-amy', to_user: ME, amount: 2, created_by: ME, created_at: '2026-10-05T00:00:00Z' },
            { id: 'p2', group_id: 'g1', from_user: 'u-amy', to_user: ME, amount: 3, created_by: 'u-amy', created_at: '2026-10-05T00:00:00Z' },
        ]);
        renderWithData(<Friends />);
        await u.click(await screen.findByRole('button', { name: /Amy/ }));
        expect(await screen.findByText(/Amy paid Daven \$2\.00/)).toBeInTheDocument();
        expect(screen.getByText(/Amy paid Daven \$3\.00/)).toBeInTheDocument();
        expect(screen.getAllByRole('button', { name: 'Undo' })).toHaveLength(1); // only the one you created
        await u.click(screen.getByRole('button', { name: 'Undo' }));
        await waitFor(() => expect(api.deleteSettlement).toHaveBeenCalledWith('p1'));
    });

    it('everyone square shows "all square" and "You two are square."', async () => {
        const u = userEvent.setup();
        api.listSessions.mockResolvedValue([]);
        renderWithData(<Friends />);
        const row = await screen.findByRole('button', { name: /Amy/ });
        expect(row).toHaveTextContent('Settled');
        expect(row).toHaveTextContent('all square');
        await u.click(row);
        expect(await screen.findByText('You two are square.')).toBeInTheDocument();
    });

    it('never lists people from your Personal section (they are only names)', async () => {
        const { group } = await import('../../test/apiMock');
        api.listGroups.mockResolvedValue([group, { id: 'gp', name: 'Personal', owner_id: ME, created_at: '2026-01-01', personal: true, members: [group.members[0], { user_id: 'g-bo', joined_at: '', name: 'Bobby', email: '', role: 'member' as const, pending: true }] }]);
        renderWithData(<Friends />);
        expect(await screen.findByText('Amy')).toBeInTheDocument();
        expect(screen.queryByText('Bobby')).not.toBeInTheDocument();
    });

    it('with no groups, invites people', async () => {
        api.listGroups.mockResolvedValue([]);
        renderWithData(<Friends />);
        expect(await screen.findByText('No one yet.')).toBeInTheDocument();
    });
});

describe('Account', () => {
    const props = { user: { id: ME, name: 'Daven Chang', email: 'me@x.com' }, onLogout: vi.fn() };

    it('shows who you are, your email and group count', async () => {
        renderWithData(<Account {...props} />);
        expect(await screen.findByRole('heading', { name: 'Daven Chang' })).toBeInTheDocument();
        await waitFor(() => expect(screen.getByText('me@x.com · 2 groups')).toBeInTheDocument());
        expect(screen.getByText('This is how you appear on receipts and in your groups.')).toBeInTheDocument();
        expect(screen.getByText("Currently me@x.com. Invites sent to your old address won't follow you after a change.")).toBeInTheDocument();
    });

    it('shows and saves the username (lowercased), and says when it is taken', async () => {
        const u = userEvent.setup();
        renderWithData(<Account {...props} />);
        const box = await screen.findByLabelText('Username');
        await waitFor(() => expect(box).toHaveValue('daven'));
        await u.clear(box);
        await u.type(box, 'Dave_C');
        await u.click(screen.getAllByRole('button', { name: 'Save' })[1]);
        await waitFor(() => expect(api.updateUsername).toHaveBeenCalledWith('Dave_C'));
        expect(await screen.findByText('Username updated.')).toBeInTheDocument();
        api.updateUsername.mockRejectedValueOnce(new Error('That username is taken.'));
        await u.clear(box);
        await u.type(box, 'taken_one');
        await u.click(screen.getAllByRole('button', { name: 'Save' })[1]);
        expect(await screen.findByText('That username is taken.')).toBeInTheDocument();
    });

    it('saves a new display name', async () => {
        const u = userEvent.setup();
        renderWithData(<Account {...props} />);
        const input = await screen.findByLabelText('Display name');
        await u.clear(input);
        await u.type(input, 'Dave');
        await u.click(screen.getAllByRole('button', { name: 'Save' })[0]);
        await waitFor(() => expect(api.updateDisplayName).toHaveBeenCalledWith('Dave'));
        expect(await screen.findByText('Name updated.')).toBeInTheDocument();
    });

    it('password form validates length, match and difference, then submits', async () => {
        const u = userEvent.setup();
        renderWithData(<Account {...props} />);
        const cur = await screen.findByLabelText('Current password');
        const next = screen.getByLabelText('New password');
        const confirm = screen.getByLabelText('Confirm new password');
        await u.type(cur, 'old-password');
        await u.type(next, 'short');
        await u.type(confirm, 'short');
        await u.click(screen.getByRole('button', { name: 'Update password' }));
        expect(await screen.findByText('New password must be at least 8 characters.')).toBeInTheDocument();
        await u.clear(next); await u.type(next, 'newpassword1');
        await u.clear(confirm); await u.type(confirm, 'different1');
        await u.click(screen.getByRole('button', { name: 'Update password' }));
        expect(await screen.findByText('New passwords do not match.')).toBeInTheDocument();
        await u.clear(next); await u.type(next, 'old-password');
        await u.clear(confirm); await u.type(confirm, 'old-password');
        await u.click(screen.getByRole('button', { name: 'Update password' }));
        expect(await screen.findByText('New password must be different from the current one.')).toBeInTheDocument();
        expect(api.changePassword).not.toHaveBeenCalled();
        await u.clear(next); await u.type(next, 'newpassword1');
        await u.clear(confirm); await u.type(confirm, 'newpassword1');
        await u.click(screen.getByRole('button', { name: 'Update password' }));
        await waitFor(() => expect(api.changePassword).toHaveBeenCalledWith('old-password', 'newpassword1'));
        expect(await screen.findByText('Password changed.')).toBeInTheDocument();
    });

    it('shows the server error when the current password is wrong', async () => {
        const u = userEvent.setup();
        api.changePassword.mockRejectedValueOnce(new Error('Current password is incorrect.'));
        renderWithData(<Account {...props} />);
        await u.type(await screen.findByLabelText('Current password'), 'wrongpass1');
        await u.type(screen.getByLabelText('New password'), 'newpassword1');
        await u.type(screen.getByLabelText('Confirm new password'), 'newpassword1');
        await u.click(screen.getByRole('button', { name: 'Update password' }));
        expect(await screen.findByText('Current password is incorrect.')).toBeInTheDocument();
    });

    it('password fields can be revealed', async () => {
        const u = userEvent.setup();
        renderWithData(<Account {...props} />);
        const cur = await screen.findByLabelText('Current password');
        expect(cur).toHaveAttribute('type', 'password');
        await u.click(screen.getByLabelText('Show current password'));
        expect(cur).toHaveAttribute('type', 'text');
    });

    it('requests an email change and signs out', async () => {
        const u = userEvent.setup();
        renderWithData(<Account {...props} />);
        await u.type(await screen.findByLabelText('Email'), 'next@x.com');
        await u.click(screen.getByRole('button', { name: 'Change' }));
        await waitFor(() => expect(api.requestEmailChange).toHaveBeenCalledWith('next@x.com'));
        expect(await screen.findByText(/Confirmation sent/)).toBeInTheDocument();
        await u.click(screen.getByRole('button', { name: /Sign out/ }));
        expect(props.onLogout).toHaveBeenCalled();
    });
});

describe('Admin', () => {
    it('lists users with stats, filters, and force-confirms a pending one', async () => {
        const u = userEvent.setup();
        renderWithData(<Admin />);
        expect(await screen.findByText('Daven')).toBeInTheDocument();
        expect(screen.getByText('Pending')).toBeInTheDocument();
        expect(screen.getByText('Admin', { selector: 'span' })).toBeInTheDocument();
        await u.type(screen.getByPlaceholderText(/Search name or email/), 'pend');
        await waitFor(() => expect(screen.queryByText('Daven')).not.toBeInTheDocument());
        await u.click(screen.getByRole('button', { name: 'Force confirm' }));
        await waitFor(() => expect(api.adminConfirmUser).toHaveBeenCalledWith('b'));
    });

    it('create-user form expands, force creates, and shows the credentials once', async () => {
        const u = userEvent.setup();
        renderWithData(<Admin />);
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
        renderWithData(<Admin />);
        expect(await screen.findByText('You do not have admin access.')).toBeInTheDocument();
    });
});
