// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

vi.mock('../../lib/api', async () => (await import('../../test/apiMock')).apiMock);
vi.mock('../../lib/supabase', async () => (await import('../../test/apiMock')).supabaseModule);

import { apiMock as api, resetMocks, ME } from '../../test/apiMock';
import { renderWithData } from '../../test/render';
import Dashboard from '../Dashboard';
import GroupDetail from '../GroupDetail';

beforeEach(resetMocks);
afterEach(cleanup);

describe('Home', () => {
    const props = { user: { id: ME, name: 'Daven Chang' }, narrow: false, newGroupTick: 0, onOpenGroup: vi.fn(), onGoFriends: vi.fn() };

    it('greets by time of day and shows what you are owed across groups', async () => {
        renderWithData(<Dashboard {...props} />);
        expect(await screen.findByRole('heading', { level: 1, name: /^(Morning|Afternoon|Evening), Daven$/ })).toBeInTheDocument();
        expect(screen.getByText("Here's where things stand across your groups.")).toBeInTheDocument();
        // Amy owes 8.85 + 600 - 30, Bo owes 3.97 + 600
        await waitFor(() => expect(screen.getByText('$1,182.82')).toBeInTheDocument(), { timeout: 3000 });
        expect(screen.getByText("You're owed")).toBeInTheDocument();
        expect(screen.getByText('You owe')).toBeInTheDocument();
    });

    it('lists groups with people and expense counts and a net balance, and opens one', async () => {
        const u = userEvent.setup();
        renderWithData(<Dashboard {...props} />);
        const row = (await screen.findByText('Roomies')).closest('button')!;
        expect(within(row).getByText('3 people · 3 expenses')).toBeInTheDocument();
        expect(within(row).getByText("you're owed")).toBeInTheDocument();
        const ski = screen.getByText('Ski Trip').closest('button')!;
        expect(within(ski).getByText('all square')).toBeInTheDocument();
        await u.click(row);
        expect(props.onOpenGroup).toHaveBeenCalledWith('g1');
    });

    it('Settle up goes to Friends', async () => {
        const u = userEvent.setup();
        renderWithData(<Dashboard {...props} />);
        await u.click(await screen.findByRole('button', { name: 'Settle up' }));
        expect(props.onGoFriends).toHaveBeenCalled();
    });

    it('creates a group inline and opens it on its Members tab', async () => {
        const u = userEvent.setup();
        renderWithData(<Dashboard {...props} />);
        await screen.findByText('Roomies');
        await u.click(screen.getByRole('button', { name: /New group/ }));
        const input = await screen.findByLabelText('Group name');
        await u.type(input, 'Book club{Enter}');
        await waitFor(() => expect(api.createGroup).toHaveBeenCalledWith('Book club'));
        await waitFor(() => expect(props.onOpenGroup).toHaveBeenCalledWith('g9', 'members'));
    });

    it('the sidebar "+" (newGroupTick) opens the creator', async () => {
        const { rerender } = renderWithData(<Dashboard {...props} />);
        await screen.findByText('Roomies');
        expect(screen.queryByLabelText('Group name')).not.toBeInTheDocument();
        rerender(<Dashboard {...props} newGroupTick={1} />);
        expect(await screen.findByLabelText('Group name')).toBeInTheDocument();
    });

    it('shows invitations and answers them', async () => {
        const u = userEvent.setup();
        api.myInvites.mockResolvedValue([{ id: 'inv1', group_id: 'g9', group_name: 'Book Club', inviter_name: 'Sam', created_at: '2026-10-05' }]);
        renderWithData(<Dashboard {...props} />);
        expect(await screen.findByText('Sam invited you to Book Club')).toBeInTheDocument();
        await u.click(screen.getByRole('button', { name: 'Join group' }));
        await waitFor(() => expect(api.respondToInvite).toHaveBeenCalledWith('inv1', true));
    });

    it('declining an invitation answers it too', async () => {
        const u = userEvent.setup();
        api.myInvites.mockResolvedValue([{ id: 'inv2', group_id: 'g9', group_name: 'Book Club', inviter_name: 'Sam', created_at: '2026-10-05' }]);
        renderWithData(<Dashboard {...props} />);
        await u.click(await screen.findByRole('button', { name: 'Decline' }));
        await waitFor(() => expect(api.respondToInvite).toHaveBeenCalledWith('inv2', false));
    });

    it('shows an empty state with no groups', async () => {
        api.listGroups.mockResolvedValue([]);
        api.listSessions.mockResolvedValue([]);
        renderWithData(<Dashboard {...props} />);
        expect(await screen.findByText('No groups yet.')).toBeInTheDocument();
    });
});

describe('Group detail', () => {
    const props = { groupId: 'g1', narrow: false, onBack: vi.fn(), onOpenRecord: vi.fn() };

    it('shows the header, balance sentence and expenses grouped by month, receipts and bills together', async () => {
        renderWithData(<GroupDetail {...props} />);
        expect(await screen.findByRole('heading', { name: 'Roomies' })).toBeInTheDocument();
        expect(await screen.findByText("You're owed $1,182.82 here")).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Expenses · 3' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByText('October')).toBeInTheDocument();
        expect(screen.getByText('September')).toBeInTheDocument();
        // receipt row: items count, payer and your share
        const costco = screen.getByText('Costco').closest('button')!;
        expect(within(costco).getByText('3 items · paid by you')).toBeInTheDocument();
        expect(within(costco).getByText('$40.10')).toBeInTheDocument();
        expect(within(costco).getByText('your share $4.88')).toBeInTheDocument();
        // expense rows: category in place of item count, share from the split
        const rent = screen.getByText('October rent').closest('button')!;
        expect(within(rent).getByText('Rent & home · paid by you')).toBeInTheDocument();
        expect(within(rent).getByText('$2,400.00')).toBeInTheDocument();
        expect(within(rent).getByText('your share $1,200.00')).toBeInTheDocument();
        const pizza = screen.getByText('Pizza night').closest('button')!;
        expect(within(pizza).getByText('Dining & drinks · paid by Amy')).toBeInTheDocument();
        expect(within(pizza).getByText('your share $30.00')).toBeInTheDocument();
    });

    it('opens receipts and expenses with the right kind', async () => {
        const u = userEvent.setup();
        renderWithData(<GroupDetail {...props} />);
        await u.click(await screen.findByText('Costco'));
        expect(props.onOpenRecord).toHaveBeenCalledWith('s1', 'receipt');
        await u.click(screen.getByText('October rent'));
        expect(props.onOpenRecord).toHaveBeenCalledWith('s2', 'expense');
    });

    it('searches names, categories and item names, and filters by category', async () => {
        const u = userEvent.setup();
        renderWithData(<GroupDetail {...props} />);
        await screen.findByText('Costco');
        await u.type(screen.getByLabelText('Search expenses'), 'oat');
        expect(screen.getByText('Costco')).toBeInTheDocument();
        expect(screen.queryByText('October rent')).not.toBeInTheDocument();
        await u.clear(screen.getByLabelText('Search expenses'));
        await u.type(screen.getByLabelText('Search expenses'), 'dining');
        expect(screen.getByText('Pizza night')).toBeInTheDocument();
        expect(screen.queryByText('Costco')).not.toBeInTheDocument();
        await u.clear(screen.getByLabelText('Search expenses'));
        await u.type(screen.getByLabelText('Search expenses'), 'zzzz');
        expect(await screen.findByText('Nothing matches that search.')).toBeInTheDocument();
        await u.clear(screen.getByLabelText('Search expenses'));

        const chips = within(screen.getByRole('group', { name: 'Filter by category' }));
        await u.click(chips.getByRole('button', { name: /Rent & home/ }));
        expect(screen.getByText('October rent')).toBeInTheDocument();
        expect(screen.queryByText('Costco')).not.toBeInTheDocument();
        await u.click(chips.getByRole('button', { name: 'All' }));
        expect(screen.getByText('Costco')).toBeInTheDocument();
    });

    it('Add expense lists a bill first, then groceries, then a payback; Escape closes it', async () => {
        const u = userEvent.setup();
        renderWithData(<GroupDetail {...props} />);
        await u.click(await screen.findByRole('button', { name: /Add expense/ }));
        const menu = await screen.findByRole('menu');
        expect(within(menu).getAllByRole('menuitem').map(i => within(i).getByText(/^[A-Z]/, { selector: 'span.text-sm' }).textContent)).toEqual(['Split a bill or cost', 'Split groceries', 'Record a payback']);
        expect(within(menu).queryByText('Import from a photo')).not.toBeInTheDocument();
        await u.keyboard('{Escape}');
        await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    });

    it('"Split groceries" creates a blank grocery receipt for everyone and opens the receipt editor', async () => {
        const u = userEvent.setup();
        renderWithData(<GroupDetail {...props} />);
        await u.click(await screen.findByRole('button', { name: /Add expense/ }));
        await u.click(await screen.findByText('Split groceries'));
        await waitFor(() => expect(api.createSession).toHaveBeenCalledWith({ groupId: 'g1', name: 'Receipt', participants: ['Daven', 'Amy', 'Bo'], category: 'groceries' }));
        await waitFor(() => expect(props.onOpenRecord).toHaveBeenCalledWith('s9', 'receipt'));
    });

    it('"Split a bill or cost" creates a standalone expense split equally among everyone', async () => {
        const u = userEvent.setup();
        renderWithData(<GroupDetail {...props} />);
        await u.click(await screen.findByRole('button', { name: /Add expense/ }));
        await u.click(await screen.findByText('Split a bill or cost'));
        await waitFor(() => expect(api.createSession).toHaveBeenCalledWith({
            groupId: 'g1', kind: 'expense', name: 'New expense', category: 'other', amount: 0,
            splitMethod: 'equal', splitData: { [ME]: 1, 'u-amy': 1, 'u-bo': 1 },
        }));
        await waitFor(() => expect(props.onOpenRecord).toHaveBeenCalledWith('s9', 'expense'));
    });

    it('a double click on "Split a bill or cost" creates only one record', async () => {
        const u = userEvent.setup();
        renderWithData(<GroupDetail {...props} />);
        await u.click(await screen.findByRole('button', { name: /Add expense/ }));
        await u.dblClick(await screen.findByText('Split a bill or cost'));
        await waitFor(() => expect(props.onOpenRecord).toHaveBeenCalled());
        expect(api.createSession).toHaveBeenCalledTimes(1);
    });

    it('members tab: invites by email with validation, lists members, owner can remove with confirmation', async () => {
        const u = userEvent.setup();
        renderWithData(<GroupDetail {...props} initialTab="members" />);
        expect(await screen.findByText('Invite someone')).toBeInTheDocument();
        expect(screen.getByText('Daven (you)')).toBeInTheDocument();
        expect(screen.getByText('Owner')).toBeInTheDocument();

        const email = screen.getByLabelText('Invite by email');
        await u.type(email, 'nope');
        await u.click(screen.getByRole('button', { name: 'Send invite' }));
        expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
        await u.clear(email);
        await u.type(email, 'amy@x.com');
        await u.click(screen.getByRole('button', { name: 'Send invite' }));
        expect(await screen.findByText('That person is already in this group.')).toBeInTheDocument();
        await u.clear(email);
        await u.type(email, 'New@Example.com');
        await u.click(screen.getByRole('button', { name: 'Send invite' }));
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

    it('shows and revokes pending invites; delete group asks first and Escape dismisses', async () => {
        const u = userEvent.setup();
        api.listPendingInvites.mockResolvedValue([{ id: 'p1', group_id: 'g1', email: 'wait@x.com', created_at: '2026-10-05' }]);
        renderWithData(<GroupDetail {...props} initialTab="members" />);
        expect(await screen.findByText('wait@x.com')).toBeInTheDocument();
        await u.click(screen.getByRole('button', { name: 'Revoke' }));
        await waitFor(() => expect(api.revokeInvite).toHaveBeenCalledWith('p1'));

        await u.click(screen.getByRole('button', { name: 'Delete group' }));
        expect(await screen.findByRole('dialog')).toBeInTheDocument();
        await u.keyboard('{Escape}');
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(api.deleteGroup).not.toHaveBeenCalled();
    });

    it('a non-owner sees Leave group instead of invite and delete', async () => {
        const u = userEvent.setup();
        renderWithData(<GroupDetail {...props} groupId="g2" initialTab="members" />);
        expect(await screen.findByRole('button', { name: 'Leave group' })).toBeInTheDocument();
        expect(screen.queryByText('Invite someone')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Delete group' })).not.toBeInTheDocument();
        await u.click(screen.getByRole('button', { name: 'Leave group' }));
        await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Leave' }));
        await waitFor(() => expect(api.removeMember).toHaveBeenCalledWith('g2', ME));
        await waitFor(() => expect(props.onBack).toHaveBeenCalled());
    });

    const payback = { id: 'p1', group_id: 'g1', from_user: 'u-amy', to_user: ME, amount: 50, created_by: ME, created_at: '2026-10-04T12:00:00' };

    it('shows paybacks in the list with the expenses, newest first, with an undo for your own', async () => {
        const u = userEvent.setup();
        api.listSettlements.mockResolvedValue([payback, { ...payback, id: 'p2', from_user: ME, to_user: 'u-bo', amount: 12.5, created_by: 'u-bo', created_at: '2026-10-02T12:00:00' }]);
        renderWithData(<GroupDetail {...props} />);
        expect(await screen.findByText('Amy paid you')).toBeInTheDocument();
        expect(screen.getByText('You paid Bo')).toBeInTheDocument();
        expect(screen.getAllByText('Payback')).toHaveLength(2);
        expect(screen.getByText('$50.00')).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Expenses · 3' })).toBeInTheDocument(); // paybacks are not expenses
        expect(screen.getAllByRole('button', { name: 'Undo' })).toHaveLength(1); // only the one you recorded
        await u.click(screen.getByRole('button', { name: 'Undo' }));
        await waitFor(() => expect(api.deleteSettlement).toHaveBeenCalledWith('p1'));
    });

    it('paybacks are searchable and hidden by a category filter', async () => {
        const u = userEvent.setup();
        api.listSettlements.mockResolvedValue([payback]);
        renderWithData(<GroupDetail {...props} />);
        await screen.findByText('Amy paid you');
        await u.type(screen.getByLabelText('Search expenses'), 'payback');
        expect(screen.getByText('Amy paid you')).toBeInTheDocument();
        expect(screen.queryByText('Costco')).not.toBeInTheDocument();
        await u.clear(screen.getByLabelText('Search expenses'));
        await u.click(within(screen.getByRole('group', { name: 'Filter by category' })).getByRole('button', { name: /Rent & home/ }));
        expect(screen.queryByText('Amy paid you')).not.toBeInTheDocument();
    });

    it('"Record a payback" prefills what is outstanding, and records it in this group', async () => {
        const u = userEvent.setup();
        renderWithData(<GroupDetail {...props} />);
        await u.click(await screen.findByRole('button', { name: /Add expense/ }));
        await u.click(await screen.findByText('Record a payback'));
        const dialog = await screen.findByRole('dialog');
        // Amy owes you 578.85 in the fixtures, so it starts as "They paid me" for that amount
        expect(within(dialog).getByRole('tab', { name: 'They paid me', selected: true })).toBeInTheDocument();
        expect(within(dialog).getByLabelText('Payback amount')).toHaveValue('578.85');
        await u.clear(within(dialog).getByLabelText('Payback amount'));
        await u.type(within(dialog).getByLabelText('Payback amount'), '100');
        await u.click(within(dialog).getByRole('button', { name: 'Save payback' }));
        await waitFor(() => expect(api.recordSettlement).toHaveBeenCalledWith('g1', 'u-amy', ME, 100));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('a payback can go the other way and pick another member', async () => {
        const u = userEvent.setup();
        renderWithData(<GroupDetail {...props} />);
        await u.click(await screen.findByRole('button', { name: /Add expense/ }));
        await u.click(await screen.findByText('Record a payback'));
        const dialog = await screen.findByRole('dialog');
        await u.click(within(dialog).getByRole('tab', { name: 'I paid them' }));
        await u.selectOptions(within(dialog).getByLabelText('Member'), 'Bo');
        expect(within(dialog).getByLabelText('Payback amount')).toHaveValue('603.97'); // Bo owes you
        expect(within(dialog).getByRole('button', { name: 'Save payback' })).toBeEnabled();
        await u.clear(within(dialog).getByLabelText('Payback amount'));
        expect(within(dialog).getByRole('button', { name: 'Save payback' })).toBeDisabled();
        await u.type(within(dialog).getByLabelText('Payback amount'), '7.5');
        await u.click(within(dialog).getByRole('tab', { name: 'I paid them' }));
        await u.click(within(dialog).getByRole('button', { name: 'Save payback' }));
        await waitFor(() => expect(api.recordSettlement).toHaveBeenCalledWith('g1', ME, 'u-bo', 7.5));
    });

    it('Balances tab shows each member\'s standing and who owes whom, and can record the payment', async () => {
        const u = userEvent.setup();
        renderWithData(<GroupDetail {...props} initialTab="balances" />);
        expect(await screen.findByText('Where everyone stands')).toBeInTheDocument();
        expect(screen.getByText('Who owes whom')).toBeInTheDocument();
        expect((await screen.findAllByText('Amy', { selector: 'span.font-semibold' })).length).toBeGreaterThan(0); // in standings and in who-owes-whom
        expect(screen.getByText('$603.97', { selector: 'span.font-mono' })).toBeInTheDocument();
        await u.click(screen.getAllByRole('button', { name: 'Mark received' })[0]);
        await waitFor(() => expect(api.recordSettlement).toHaveBeenCalledWith('g1', 'u-bo', ME, 603.97));
    });

    it('on narrow screens the back link lives in the header, not the page', async () => {
        renderWithData(<GroupDetail {...props} narrow />);
        await screen.findByRole('heading', { name: 'Roomies' });
        expect(screen.queryByRole('button', { name: 'Home' })).not.toBeInTheDocument();
    });
});
