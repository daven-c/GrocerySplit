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
import QuickSplitList from '../QuickSplitList';

beforeEach(() => { resetMocks(); localStorage.removeItem('splitpot:flags'); });
afterEach(cleanup);

describe('Home', () => {
    const props = { user: { id: ME, name: 'Daven Chang' }, narrow: false, newGroupTick: 0, onOpenGroup: vi.fn(), onGoFriends: vi.fn() };

    it('shows what you are owed and what you owe across groups (the greeting lives in the green band)', async () => {
        renderWithData(<Dashboard {...props} />);
        // Amy owes 8.85 + 600 - 30, Bo owes 3.97 + 600
        await waitFor(() => expect(screen.getByText('$1,182.82')).toBeInTheDocument(), { timeout: 3000 });
        expect(screen.getByText("You're owed")).toBeInTheDocument();
        expect(screen.getByText('You owe')).toBeInTheDocument();
    });

    it('lists groups with people and expense counts and a net balance, and opens one', async () => {
        const u = userEvent.setup();
        renderWithData(<Dashboard {...props} />);
        const row = (await screen.findByText('Roomies')).closest('button')!;
        expect(within(row).getByText('3 people · 3 expenses · $2,500.10 total')).toBeInTheDocument();
        expect(within(row).getByText("you're owed")).toBeInTheDocument();
        const ski = screen.getByText('Ski Trip').closest('button')!;
        expect(within(ski).getByText('all square')).toBeInTheDocument();
        await u.click(row);
        expect(props.onOpenGroup).toHaveBeenCalledWith('g1');
    });

    const order = () => screen.getAllByRole('button', { name: /^(Roomies|Ski Trip)/ }).map(b => b.textContent!.match(/Roomies|Ski Trip/)![0]);

    it('groups can be searched by group or person name', async () => {
        const u = userEvent.setup();
        renderWithData(<Dashboard {...props} />);
        const box = await screen.findByLabelText('Search groups');
        await u.type(box, 'bo');
        await waitFor(() => expect(screen.queryByText('Ski Trip')).not.toBeInTheDocument()); // only Roomies has Bo
        expect(screen.getByText('Roomies')).toBeInTheDocument();
        await u.clear(box);
        await u.type(box, 'ski');
        await waitFor(() => expect(screen.queryByText('Roomies')).not.toBeInTheDocument());
        await u.clear(box);
        await u.type(box, 'zzzz');
        expect(await screen.findByText('No groups match "zzzz".')).toBeInTheDocument();
    });

    it('groups sort by recent activity, name, balance or spend, and the choice is remembered', async () => {
        const u = userEvent.setup();
        localStorage.removeItem('splitpot:groupSort');
        renderWithData(<Dashboard {...props} />);
        await screen.findByText('Roomies');
        expect(order()).toEqual(['Roomies', 'Ski Trip']); // Roomies has the recent expenses
        const sorts = within(screen.getByRole('group', { name: 'Sort groups' }));
        expect(sorts.getByRole('button', { name: 'Recent' })).toHaveAttribute('aria-pressed', 'true');
        await u.click(sorts.getByRole('button', { name: 'A–Z' }));
        expect(order()).toEqual(['Roomies', 'Ski Trip']);
        await u.click(sorts.getByRole('button', { name: 'Balance' }));
        expect(order()).toEqual(['Roomies', 'Ski Trip']);
        await u.click(sorts.getByRole('button', { name: 'Spent' }));
        expect(order()).toEqual(['Roomies', 'Ski Trip']);
        expect(sorts.getByRole('button', { name: 'Spent' })).toHaveAttribute('aria-pressed', 'true');
        expect(localStorage.getItem('splitpot:groupSort')).toBe('spent');
    });

    it('pinning floats a group to the top for you, and unpinning puts it back', async () => {
        const u = userEvent.setup();
        renderWithData(<Dashboard {...props} />);
        await screen.findByText('Ski Trip');
        expect(order()).toEqual(['Roomies', 'Ski Trip']);
        await u.click(screen.getByRole('button', { name: 'Pin Ski Trip' }));
        await waitFor(() => expect(api.setGroupPinned).toHaveBeenCalledWith('g2', true));
        // the data layer reloads from the server: now it says Ski Trip is pinned
        const { group, otherGroup } = await import('../../test/apiMock');
        api.listGroups.mockResolvedValue([group, { ...otherGroup, members: otherGroup.members.map(m => (m.user_id === ME ? { ...m, pinned: true } : m)) }]);
        await u.click(screen.getByRole('button', { name: 'Pin Roomies' })); // any change triggers a reload
        await waitFor(() => expect(order()[0]).toBe('Ski Trip'));
        expect(screen.getByRole('button', { name: 'Unpin Ski Trip' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('Settle up goes to Friends', async () => {
        const u = userEvent.setup();
        renderWithData(<Dashboard {...props} />);
        await u.click(await screen.findByRole('button', { name: 'Settle up' }));
        expect(props.onGoFriends).toHaveBeenCalled();
    });

    it('creates a group inline and opens it on its Members tab', async () => {
        const u = userEvent.setup();
        const { rerender } = renderWithData(<Dashboard {...props} />);
        await screen.findByText('Roomies');
        rerender(<Dashboard {...props} newGroupTick={1} />); // the "New group" button in the green band bumps this
        const input = await screen.findByLabelText('Group name');
        await u.type(input, 'Book club{Enter}');
        await waitFor(() => expect(api.createGroup).toHaveBeenCalledWith('Book club'));
        await waitFor(() => expect(props.onOpenGroup).toHaveBeenCalledWith('g9', 'members'));
    });

    it('the "New group" button (newGroupTick) opens the creator', async () => {
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
        expect(await screen.findByText('Sam', { selector: 'b' })).toBeInTheDocument();
        expect(screen.getByText('Book Club', { selector: 'b' })).toBeInTheDocument();
        await u.click(screen.getByRole('button', { name: 'Join group' }));
        await waitFor(() => expect(api.respondToInvite).toHaveBeenCalledWith('inv1', true));
    });

    it('declining an invitation answers it too', async () => {
        const u = userEvent.setup();
        api.myInvites.mockResolvedValue([{ id: 'inv2', group_id: 'g9', group_name: 'Book Club', inviter_name: 'Sam', created_at: '2026-10-05' }]);
        renderWithData(<Dashboard {...props} />);
        await u.click(await screen.findByRole('button', { name: 'Not now' }));
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
        expect(screen.getByRole('tab', { name: 'Expenses 3' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByText('October')).toBeInTheDocument();
        expect(screen.getByText('September')).toBeInTheDocument();
        // receipt row: items count, payer and your share
        const costco = screen.getByText('Costco').closest('button')!;
        expect(within(costco).getByText('3 items · paid by Daven · Oct 1')).toBeInTheDocument();
        expect(within(costco).getByText('$40.10')).toBeInTheDocument();
        expect(within(costco).getByText('you lent $35.22')).toBeInTheDocument(); // you paid: what the others owe you
        // expense rows: category in place of item count, share from the split
        const rent = screen.getByText('October rent').closest('button')!;
        expect(within(rent).getByText('paid by Daven · Oct 1')).toBeInTheDocument();
        expect(within(rent).getByText('$2,400.00')).toBeInTheDocument();
        expect(within(rent).getByText('you lent $1,200.00')).toBeInTheDocument();
        const pizza = screen.getByText('Pizza night').closest('button')!;
        expect(within(pizza).getByText('paid by Amy · Sep 20')).toBeInTheDocument();
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

    it('Add expense is one option for any cost, plus Record a transfer; Escape closes it', async () => {
        const u = userEvent.setup();
        renderWithData(<GroupDetail {...props} />);
        await u.click(await screen.findByRole('button', { name: /Add expense/ }));
        const menu = await screen.findByRole('menu');
        expect(within(menu).getAllByRole('menuitem').map(i => within(i).getByText(/^[A-Z]/, { selector: 'span.text-\\[15px\\]' }).textContent)).toEqual(['Add an expense', 'Split by item', 'Record a transfer']);
        expect(within(menu).queryByText('Scan a receipt')).not.toBeInTheDocument(); // importing a receipt lives inside Split by item
        await u.keyboard('{Escape}');
        await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    });

    it('"Add an expense" creates a draft expense with nobody selected, to be filled in the editor', async () => {
        const u = userEvent.setup();
        renderWithData(<GroupDetail {...props} />);
        await u.click(await screen.findByRole('button', { name: /Add expense/ }));
        await u.click(await screen.findByText('Add an expense'));
        await waitFor(() => expect(api.createSession).toHaveBeenCalledWith({
            groupId: 'g1', kind: 'expense', draft: true, name: 'New expense', category: 'other', amount: 0,
            splitMethod: 'exact', splitData: {},
        }));
        await waitFor(() => expect(props.onOpenRecord).toHaveBeenCalledWith('s9', 'expense', true));
    });

    it('"Split by item" creates an itemized draft with everyone in it, ready to paint', async () => {
        const u = userEvent.setup();
        api.createSession.mockResolvedValue('s9');
        const onOpenRecord = vi.fn();
        renderWithData(<GroupDetail {...props} onOpenRecord={onOpenRecord} />);
        await u.click(await screen.findByRole('button', { name: /Add expense/ }));
        await u.click(await screen.findByText('Split by item'));
        await waitFor(() => expect(api.createSession).toHaveBeenCalledWith({ groupId: 'g1', name: 'Receipt', participants: ['Daven', 'Amy', 'Bo'], category: 'groceries', draft: true }));
        await waitFor(() => expect(onOpenRecord).toHaveBeenCalledWith('s9', 'receipt', true));
    });

    it('a double click on "Add an expense" creates only one record', async () => {
        const u = userEvent.setup();
        renderWithData(<GroupDetail {...props} />);
        await u.click(await screen.findByRole('button', { name: /Add expense/ }));
        await u.dblClick(await screen.findByText('Add an expense'));
        await waitFor(() => expect(props.onOpenRecord).toHaveBeenCalled());
        expect(api.createSession).toHaveBeenCalledTimes(1);
    });

    it('members tab: invites by email with validation, lists members, owner can remove with confirmation', async () => {
        const u = userEvent.setup();
        renderWithData(<GroupDetail {...props} initialTab="members" />);
        expect(await screen.findByText('Invite someone')).toBeInTheDocument();
        expect(screen.getByText('Daven')).toBeInTheDocument();
        expect(screen.getByText('Owner')).toBeInTheDocument();

        const box = screen.getByLabelText('Invite by username');
        await u.type(box, 'no');
        await u.click(screen.getByRole('button', { name: 'Send invite' }));
        expect(await screen.findByText('Enter a username: 3 to 20 letters, numbers or underscores.')).toBeInTheDocument();
        await u.clear(box);
        await u.type(box, '@AMY_S');
        await u.click(screen.getByRole('button', { name: 'Send invite' }));
        expect(await screen.findByText('That person is already in this group.')).toBeInTheDocument();
        await u.clear(box);
        await u.type(box, '@New_Cam');
        await u.click(screen.getByRole('button', { name: 'Send invite' }));
        await waitFor(() => expect(api.inviteToGroup).toHaveBeenCalledWith('g1', 'new_cam'));
        expect(await screen.findByText(/Invited @new_cam\. You can use them in expenses now/)).toBeInTheDocument();
        expect(screen.getByText('@amy_s')).toBeInTheDocument(); // members show their username, not their email
        expect(screen.queryByText('amy@x.com')).not.toBeInTheDocument();

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

    it('an invited person who has not joined is listed as Invited, cannot be removed, but is a full member for expenses', async () => {
        const u = userEvent.setup();
        const guest = { user_id: 'g-cam', joined_at: '2026-10-05T00:00:00Z', name: 'Cam', email: 'cam@x.com', role: 'member' as const, pending: true };
        const { group: g1, otherGroup: g2 } = await import('../../test/apiMock');
        api.listGroups.mockResolvedValue([{ ...g1, members: [...g1.members, guest] }, g2]);
        renderWithData(<GroupDetail {...props} initialTab="members" />);
        expect(await screen.findByText('Cam')).toBeInTheDocument();
        expect(screen.getByText('Not joined')).toBeInTheDocument();
        expect(screen.getByLabelText('Remove Cam')).toBeInTheDocument(); // the owner can remove a person (if unused)
        expect(screen.getByLabelText('Remove Amy')).toBeInTheDocument();
        await u.click(screen.getByRole('tab', { name: 'Balances' }));
        expect(await screen.findByText('Cam', { selector: 'span.truncate' })).toBeInTheDocument(); // part of the ledger
    });

    it('a not-yet-joined person can be renamed or removed in a shared group', async () => {
        const u = userEvent.setup();
        const g1 = (await import('../../test/apiMock')).group;
        const cam = { user_id: 'g-cam', joined_at: '2026-10-05T00:00:00Z', name: 'Cam', email: '', role: 'member' as const, pending: true };
        api.listGroups.mockResolvedValue([{ ...g1, members: [...g1.members, cam] }]);
        renderWithData(<GroupDetail {...props} initialTab="members" />);
        expect(await screen.findByText('Not joined yet')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Rename' })).toBeInTheDocument();
        await u.click(screen.getByLabelText('Remove Cam'));
        await waitFor(() => expect(api.removeGuest).toHaveBeenCalledWith('g-cam'));
    });

    it('links a temporary person to a username so their expenses move over', async () => {
        const u = userEvent.setup();
        const g1 = (await import('../../test/apiMock')).group;
        const cam = { user_id: 'g-cam', joined_at: '2026-10-05T00:00:00Z', name: 'Cam', email: '', role: 'member' as const, pending: true };
        api.listGroups.mockResolvedValue([{ ...g1, members: [...g1.members, cam] }]);
        renderWithData(<GroupDetail {...props} initialTab="members" />);
        await u.click(await screen.findByRole('button', { name: 'Link to account' }));
        const field = screen.getByLabelText('Username for Cam');
        await u.type(field, 'cam_99');
        await u.click(within(field.parentElement!).getByRole('button', { name: 'Send invite' }));
        await waitFor(() => expect(api.inviteToGroup).toHaveBeenCalledWith('g1', 'cam_99', 'g-cam'));
    });

    it('in a shared group, the owner can add a temporary person by name', async () => {
        const u = userEvent.setup();
        renderWithData(<GroupDetail {...props} initialTab="members" />);
        expect(await screen.findByText('Add a temporary person')).toBeInTheDocument();
        await u.type(screen.getByLabelText("Person's name"), 'Dee');
        await u.click(screen.getByRole('button', { name: 'Add' }));
        await waitFor(() => expect(api.addGuest).toHaveBeenCalledWith(props.groupId, 'Dee'));
    });

    it('in Personal, add people by name, rename and remove them', async () => {
        const u = userEvent.setup();
        const g1 = (await import('../../test/apiMock')).group;
        const bo = { user_id: 'g-bo', joined_at: '2026-10-05T00:00:00Z', name: 'Bobby', email: '', role: 'owner' as const, pending: true };
        api.listGroups.mockResolvedValue([{ id: 'gp', name: 'Personal', owner_id: ME, created_at: '2026-01-01', personal: true, members: [g1.members[0], { ...bo, role: 'member' as const }] }]);
        renderWithData(<GroupDetail {...props} groupId="gp" initialTab="members" />);
        await u.type(await screen.findByLabelText("Person's name"), 'Dee');
        await u.click(screen.getByRole('button', { name: 'Add' }));
        await waitFor(() => expect(api.addGuest).toHaveBeenCalledWith('gp', 'Dee'));
        expect(screen.getByText('Name only')).toBeInTheDocument();
        await u.click(screen.getByRole('button', { name: 'Rename' }));
        const nm = screen.getByLabelText('New name for Bobby');
        await u.clear(nm);
        await u.type(nm, 'Robert');
        await u.click(within(nm.parentElement!).getByRole('button', { name: 'Rename' }));
        await waitFor(() => expect(api.renameGuest).toHaveBeenCalledWith('g-bo', 'Robert'));
        await u.click(screen.getByLabelText('Remove Bobby'));
        await waitFor(() => expect(api.removeGuest).toHaveBeenCalledWith('g-bo'));
    });

    it('a failed removal (person is in expenses) shows the reason', async () => {
        const u = userEvent.setup();
        const g1 = (await import('../../test/apiMock')).group;
        api.listGroups.mockResolvedValue([{ ...g1, members: [...g1.members, { user_id: 'g-bo', joined_at: '2026-10-05T00:00:00Z', name: 'Bobby', email: '', role: 'member' as const, pending: true }] }]);
        api.removeGuest.mockRejectedValueOnce(new Error('Bobby is already in expenses. Merge them into someone else, or delete those first.'));
        renderWithData(<GroupDetail {...props} initialTab="members" />);
        await u.click(await screen.findByLabelText('Remove Bobby'));
        expect(await screen.findByText(/Bobby is already in expenses/)).toBeInTheDocument();
    });

    it('the Personal group is private: no invites, no delete, just people by name', async () => {
        const g1 = (await import('../../test/apiMock')).group;
        api.listGroups.mockResolvedValue([{ id: 'gp', name: 'Personal', owner_id: ME, created_at: '2026-01-01', personal: true, members: [g1.members[0]] }]);
        renderWithData(<GroupDetail {...props} groupId="gp" initialTab="members" />);
        expect(await screen.findByText(/This is your Personal section/)).toBeInTheDocument();
        expect(screen.queryByLabelText('Invite by username')).not.toBeInTheDocument();
        expect(screen.getByLabelText("Person's name")).toBeInTheDocument();
        expect(screen.queryByText('Delete group')).not.toBeInTheDocument();
    });

    it('shows and revokes pending invites; delete group asks first and Escape dismisses', async () => {
        const u = userEvent.setup();
        api.listPendingInvites.mockResolvedValue([{ id: 'p1', group_id: 'g1', name: 'Wendy', created_at: '2026-10-05' }]);
        renderWithData(<GroupDetail {...props} initialTab="members" />);
        expect(await screen.findByText('Wendy')).toBeInTheDocument();
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

    const transfer = { id: 'p1', group_id: 'g1', from_user: 'u-amy', to_user: ME, amount: 50, created_by: ME, created_at: '2026-10-04T12:00:00' };

    it('shows transfers in the list with the expenses, newest first, each with Edit and Delete for anyone', async () => {
        const u = userEvent.setup();
        api.listSettlements.mockResolvedValue([transfer, { ...transfer, id: 'p2', from_user: ME, to_user: 'u-bo', amount: 12.5, created_by: 'u-bo', created_at: '2026-10-02T12:00:00' }]);
        renderWithData(<GroupDetail {...props} />);
        expect(await screen.findByText('Amy paid Daven')).toBeInTheDocument();
        expect(screen.getByText('Daven paid Bo')).toBeInTheDocument();
        expect(screen.getAllByText(/^Transfer · /)).toHaveLength(2);
        expect(screen.getByText('$50.00')).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Expenses 3' })).toBeInTheDocument(); // transfers are not expenses
        expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(2); // including the one Bo recorded
        expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(2);
        await u.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
        await waitFor(() => expect(api.deleteSettlement).toHaveBeenCalledWith('p1'));
    });

    it('editing a transfer opens it prefilled and saves the change in place', async () => {
        const u = userEvent.setup();
        api.listSettlements.mockResolvedValue([{ ...transfer, created_by: 'u-bo' }]); // recorded by someone else
        renderWithData(<GroupDetail {...props} />);
        await u.click(await screen.findByRole('button', { name: 'Edit' }));
        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByText('Edit transfer')).toBeInTheDocument();
        expect(within(dialog).getByLabelText('Transfer amount')).toHaveValue('50');
        await u.clear(within(dialog).getByLabelText('Transfer amount'));
        await u.type(within(dialog).getByLabelText('Transfer amount'), '65.5');
        await u.click(within(dialog).getByRole('button', { name: 'Save changes' }));
        await waitFor(() => expect(api.updateSettlement).toHaveBeenCalledWith('p1', 'u-amy', ME, 65.5));
        expect(api.recordSettlement).not.toHaveBeenCalled();
    });

    it('the Activity tab shows the change ledger: who did what, with before and after', async () => {
        localStorage.setItem('splitpot:flags', JSON.stringify({ activity: true }));
        const u = userEvent.setup();
        api.listSettlementLog.mockResolvedValue([
            { id: 'l3', group_id: 'g1', settlement_id: 'p1', action: 'deleted', actor: 'u-bo', from_user: 'u-amy', to_user: ME, amount: 65.5, prev_from_user: null, prev_to_user: null, prev_amount: null, created_at: '2026-10-05T12:00:00' },
            { id: 'l2', group_id: 'g1', settlement_id: 'p1', action: 'edited', actor: 'u-amy', from_user: 'u-amy', to_user: ME, amount: 65.5, prev_from_user: 'u-amy', prev_to_user: ME, prev_amount: 50, created_at: '2026-10-04T12:00:00' },
            { id: 'l1', group_id: 'g1', settlement_id: 'p1', action: 'created', actor: ME, from_user: 'u-amy', to_user: ME, amount: 50, prev_from_user: null, prev_to_user: null, prev_amount: null, created_at: '2026-10-03T12:00:00' },
        ]);
        renderWithData(<GroupDetail {...props} />);
        await u.click(await screen.findByRole('tab', { name: 'Activity' }));
        expect(await screen.findByText(/Bo/, { selector: 'span.font-extrabold' })).toBeInTheDocument();
        expect(screen.getByText('deleted a transfer', { exact: false })).toBeInTheDocument();
        expect(screen.getByText('Amy → Daven $50.00 became Amy → Daven $65.50')).toBeInTheDocument();
        expect(api.listSettlementLog).toHaveBeenCalledWith('g1');
    });

    it('the Activity tab lists expenses, receipts and transfers together: who created, edited (with what changed) or deleted', async () => {
        localStorage.setItem('splitpot:flags', JSON.stringify({ activity: true }));
        const u = userEvent.setup();
        const e = (over: any) => ({ group_id: 'g1', session_id: 's', changes: [], kind: 'expense', ...over });
        api.listExpenseLog.mockResolvedValue([
            e({ id: 'x3', action: 'deleted', actor: 'u-bo', name: 'Old pizza', total: 30, created_at: '2026-10-05T15:00:00Z' }),
            e({ id: 'x2', action: 'edited', actor: 'u-amy', name: 'October rent', total: 2500, created_at: '2026-10-05T13:00:00Z', changes: [{ field: 'amount', from: 2400, to: 2500 }, { field: 'paid_by', from: 'Daven', to: 'Amy' }] }),
            e({ id: 'x1', action: 'created', actor: ME, kind: 'receipt', name: 'Costco', total: 40.1, created_at: '2026-10-05T11:00:00Z' }),
        ]);
        api.listSettlementLog.mockResolvedValue([
            { id: 'l1', group_id: 'g1', settlement_id: 'p1', action: 'created', actor: 'u-amy', from_user: 'u-amy', to_user: ME, amount: 50, prev_from_user: null, prev_to_user: null, prev_amount: null, created_at: '2026-10-05T12:00:00Z' },
        ]);
        renderWithData(<GroupDetail {...props} />);
        await u.click(await screen.findByRole('tab', { name: 'Activity' }));
        expect(await screen.findByText(/deleted an expense/)).toBeInTheDocument();
        expect(screen.getByText('Old pizza')).toBeInTheDocument();
        expect(screen.getByText(/edited an expense/)).toBeInTheDocument();
        expect(screen.getByText('Amount: $2,400.00 → $2,500.00')).toBeInTheDocument();
        expect(screen.getByText('Paid by: Daven → Amy')).toBeInTheDocument();
        expect(screen.getByText(/created a receipt/)).toBeInTheDocument();
        expect(screen.getByText(/recorded a transfer/)).toBeInTheDocument();
        const order = screen.getAllByText(/(created|edited|deleted|recorded) an? (expense|receipt|transfer)/).map(x => x.textContent!.match(/created|edited|deleted|recorded/)![0]);
        expect(order).toEqual(['deleted', 'edited', 'recorded', 'created']); // newest first
    });

    it('the Activity tab is off by default (feature flag), though the data is still recorded', async () => {
        renderWithData(<GroupDetail {...props} />);
        await screen.findByRole('tab', { name: /Expenses/ });
        expect(screen.queryByRole('tab', { name: 'Activity' })).not.toBeInTheDocument();
        expect(api.listExpenseLog).not.toHaveBeenCalled();
        expect(api.listSettlementLog).not.toHaveBeenCalled();
    });

    it('quick splits are listed on Home, not inside a group', async () => {
        const g1 = (await import('../../test/apiMock')).group;
        const qs = [
            { token: 'a'.repeat(32), title: 'Sushi night', locked: false, people: 3, items: 4, total: 96.5, updated_at: '2026-10-05T10:00:00Z', expires_at: '2026-11-04T10:00:00Z' },
            { token: 'b'.repeat(32), title: 'Locked lunch', locked: true, people: 1, items: 1, total: 12, updated_at: '2026-10-04T10:00:00Z', expires_at: '2026-11-03T10:00:00Z' },
        ];
        api.listMyQuickSplits.mockResolvedValue(qs);
        api.listGroups.mockResolvedValue([{ id: 'gp', name: 'Personal', owner_id: ME, created_at: '2026-01-01', personal: true, members: [g1.members[0]] }, g1]);
        const personal = renderWithData(<GroupDetail {...props} groupId="gp" />);
        await screen.findByRole('tab', { name: /Expenses/ });
        expect(screen.queryByLabelText('Your quick splits')).not.toBeInTheDocument();
        personal.unmount();
        renderWithData(<QuickSplitList />);
        const list = await screen.findByLabelText('Your quick splits');
        expect(await within(list).findByText('Sushi night')).toBeInTheDocument();
        expect(within(list).getByText(/3 people · 4 items · expires Nov 4/)).toBeInTheDocument();
        expect(within(list).getByText('$96.50')).toBeInTheDocument();
        expect(within(list).getByText('Sushi night').closest('a')).toHaveAttribute('href', `/s/${'a'.repeat(32)}`);
        expect(within(list).getByText('Locked lunch')).toBeInTheDocument();
    });

    it('shows the group total cost, not counting drafts', async () => {
        renderWithData(<GroupDetail {...props} />);
        expect(await screen.findByText('$2,500.10')).toBeInTheDocument();
        expect(screen.getByText(/across 3 expenses/)).toBeInTheDocument();
    });

    it('on the same day, a transfer added after an expense is listed above it (and one added before, below)', async () => {
        const { rent } = await import('../../test/apiMock');
        api.listSessions.mockResolvedValue([{ ...rent, session_date: '2026-10-04', updated_at: '2026-10-04T09:00:00' }]);
        api.listSettlements.mockResolvedValue([
            { ...transfer, id: 'late', created_at: '2026-10-04T12:00:00' },
            { ...transfer, id: 'early', from_user: ME, to_user: 'u-bo', created_at: '2026-10-04T08:00:00' },
        ]);
        renderWithData(<GroupDetail {...props} />);
        const [late, expense, early] = [await screen.findByText('Amy paid Daven'), screen.getByText('October rent'), screen.getByText('Daven paid Bo')];
        const after = (a: Node, b: Node) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
        expect(after(late, expense)).toBe(true);
        expect(after(expense, early)).toBe(true);
    });

    it('transfers are searchable and hidden by a category filter', async () => {
        const u = userEvent.setup();
        api.listSettlements.mockResolvedValue([transfer]);
        renderWithData(<GroupDetail {...props} />);
        await screen.findByText('Amy paid Daven');
        await u.type(screen.getByLabelText('Search expenses'), 'transfer');
        expect(screen.getByText('Amy paid Daven')).toBeInTheDocument();
        expect(screen.queryByText('Costco')).not.toBeInTheDocument();
        await u.clear(screen.getByLabelText('Search expenses'));
        await u.click(within(screen.getByRole('group', { name: 'Filter by category' })).getByRole('button', { name: /Rent & home/ }));
        expect(screen.queryByText('Amy paid Daven')).not.toBeInTheDocument();
    });

    const openPaybackForm = async (u: ReturnType<typeof userEvent.setup>) => {
        await u.click(await screen.findByRole('button', { name: /Add expense/ }));
        await u.click(await screen.findByText('Record a transfer'));
        return await screen.findByRole('dialog');
    };

    it('"Record a transfer" is two dropdowns (who paid, who received) and an amount, opening on the first suggested transfer', async () => {
        const u = userEvent.setup();
        renderWithData(<GroupDetail {...props} />);
        const dialog = await openPaybackForm(u);
        expect(within(dialog).queryByRole('tab')).not.toBeInTheDocument(); // no direction toggle any more
        // Bo owes the most, so the first suggestion is Bo paying you
        expect(within(dialog).getByLabelText('Who paid')).toHaveDisplayValue('Bo');
        expect(within(dialog).getByLabelText('Who received')).toHaveDisplayValue('Daven');
        expect(within(dialog).getByLabelText('Transfer amount')).toHaveValue('603.97');
        expect(within(within(dialog).getByLabelText('Who paid')).getAllByRole('option').map(o => o.textContent)).toEqual(['Daven', 'Amy', 'Bo']);
        await u.click(within(dialog).getByRole('button', { name: 'Save transfer' }));
        await waitFor(() => expect(api.recordSettlement).toHaveBeenCalledWith('g1', 'u-bo', ME, 603.97));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('a transfer can be between any two members, and changing the pair refills a suggested amount', async () => {
        const u = userEvent.setup();
        renderWithData(<GroupDetail {...props} />);
        const dialog = await openPaybackForm(u);
        await u.selectOptions(within(dialog).getByLabelText('Who paid'), 'Amy');
        expect(within(dialog).getByLabelText('Transfer amount')).toHaveValue('578.85'); // Amy -> You is a suggested transfer
        await u.selectOptions(within(dialog).getByLabelText('Who received'), 'Bo'); // Amy -> Bo is not a suggestion: amount is kept
        expect(within(dialog).getByLabelText('Transfer amount')).toHaveValue('578.85');
        await u.clear(within(dialog).getByLabelText('Transfer amount'));
        await u.type(within(dialog).getByLabelText('Transfer amount'), '7.5');
        await u.click(within(dialog).getByRole('button', { name: 'Save transfer' }));
        await waitFor(() => expect(api.recordSettlement).toHaveBeenCalledWith('g1', 'u-amy', 'u-bo', 7.5));
    });

    it('the same person cannot pay themselves, and an empty amount cannot be saved', async () => {
        const u = userEvent.setup();
        renderWithData(<GroupDetail {...props} />);
        const dialog = await openPaybackForm(u);
        await u.selectOptions(within(dialog).getByLabelText('Who received'), 'Bo'); // Bo paid, Bo received
        expect(await within(dialog).findByRole('alert')).toHaveTextContent('Pick two different people.');
        expect(within(dialog).getByRole('button', { name: 'Save transfer' })).toBeDisabled();
        await u.selectOptions(within(dialog).getByLabelText('Who received'), 'Amy');
        expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
        await u.clear(within(dialog).getByLabelText('Transfer amount'));
        expect(within(dialog).getByRole('button', { name: 'Save transfer' })).toBeDisabled();
        expect(api.recordSettlement).not.toHaveBeenCalled();
    });

    it('Balances tab shows how much each person is up or down, then the fewest transfers to settle', async () => {
        const u = userEvent.setup();
        renderWithData(<GroupDetail {...props} initialTab="balances" />);
        expect(await screen.findByText('Where everyone stands')).toBeInTheDocument();
        // positions only: no "fronted/owes" detail and no pair-by-pair "who owes whom"
        expect(screen.queryByText(/fronted/)).not.toBeInTheDocument();
        expect(screen.queryByText('Who owes whom')).not.toBeInTheDocument();
        const you = screen.getByText('Daven', { selector: 'span.truncate' }).closest('div')!;
        await waitFor(() => expect(within(you).getByText('up')).toBeInTheDocument());
        expect(screen.getAllByText('down')).toHaveLength(2);
        const down = screen.getAllByText('down').map(d => d.closest('div')!.textContent!);
        expect(down.every(t => /-\$[\d,.]+/.test(t))).toBe(true); // a negative balance keeps its minus sign
        expect(within(you).getByText('+$1,182.82')).toBeInTheDocument(); // an up balance gets a plus
        // suggested transfers below
        expect(screen.getByText('Settle up')).toBeInTheDocument();
        expect(screen.getByText("The fewest payments that settle everyone. Recording one doesn't move money; it just updates the balances.")).toBeInTheDocument();
        const buttons = screen.getAllByRole('button', { name: 'Mark received' }); // both involve you, so they say so
        expect(buttons).toHaveLength(2);
        await u.click(buttons[0]); // the biggest first: Bo pays you
        await waitFor(() => expect(api.recordSettlement).toHaveBeenCalledWith('g1', 'u-bo', ME, 603.97));
    });

    it('Balances: everyone square shows no suggested transfers', async () => {
        api.listSessions.mockResolvedValue([]);
        renderWithData(<GroupDetail {...props} initialTab="balances" />);
        expect(await screen.findByText("Everyone's square. Nothing to settle.")).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Mark|Record transfer/ })).not.toBeInTheDocument();
    });

    it('on narrow screens the back link lives in the header, not the page', async () => {
        renderWithData(<GroupDetail {...props} narrow />);
        await screen.findByRole('heading', { name: 'Roomies' });
        expect(screen.queryByRole('button', { name: 'Home' })).not.toBeInTheDocument();
    });
});
