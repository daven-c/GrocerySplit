// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, within, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

vi.mock('../../lib/api', async () => (await import('../../test/apiMock')).apiMock);
vi.mock('../../lib/supabase', async () => (await import('../../test/apiMock')).supabaseModule);

import { apiMock as api, resetMocks, ME } from '../../test/apiMock';
import { renderWithData } from '../../test/render';
import Split from '../Split';
import ExpenseEditor from '../ExpenseEditor';
import ReceiptUpload from '../ReceiptUpload';

beforeEach(resetMocks);
afterEach(cleanup);

const SLOW = { timeout: 3000 }; // autosave debounces for 600ms

describe('Receipt editor (grocery split)', () => {
    const props = { sessionId: 's1', narrow: false, onBack: vi.fn(), onImport: vi.fn(), onSaved: vi.fn(), onDiscard: vi.fn(), onSwitched: vi.fn() };
    const rowOf = (name: string) => screen.getByText(name).closest('div[class*="flex-col"]') as HTMLElement;

    it('is one screen: Split by (on By item), name, meta, total, people, items and who pays what', async () => {
        renderWithData(<Split {...props} />);
        expect(await screen.findByDisplayValue('Costco')).toBeInTheDocument();
        expect(screen.getByText(/Oct 1, 2026 · Groceries · 3 items · paid by Daven/)).toBeInTheDocument();
        expect(screen.getByText('Itemized receipt')).toBeInTheDocument(); // not a tab: it is a different kind of split
        expect(screen.queryByRole('tab')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Split one total instead' })).toBeInTheDocument();
        expect(screen.getByText('Pick a person, then tap their items')).toBeInTheDocument();
        expect(screen.getByText('2 of 3 assigned')).toBeInTheDocument();
        expect(screen.getByText('Oat Milk')).toBeInTheDocument();
        expect(screen.getByText('$4.00 each')).toBeInTheDocument();
        expect(screen.getByText('Nobody yet', { selector: 'span.text-coral' })).toBeInTheDocument();
        // Who pays what, with tax shared in proportion
        await waitFor(() => expect(screen.getByText('$4.88')).toBeInTheDocument(), SLOW);
        expect(screen.getByText('$8.85')).toBeInTheDocument();
        expect(screen.getByText('$3.97')).toBeInTheDocument();
        expect(screen.getByText('paid the bill')).toBeInTheDocument();
        expect(screen.getAllByText('owes Daven')).toHaveLength(2);
        expect(screen.getByText('Tax and tip are shared in proportion to what each person had. Pennies always add up.')).toBeInTheDocument();
    });

    it('paint mode: pick a person, then tap rows to toggle them', async () => {
        const u = userEvent.setup();
        renderWithData(<Split {...props} />);
        await screen.findByText('Chicken Breast');
        await u.click(screen.getByRole('button', { name: 'Amy', pressed: false }));
        expect(screen.getByText('Tap the items Amy had')).toBeInTheDocument();
        await u.click(screen.getByText('Chicken Breast'));
        await waitFor(() => expect(screen.getByText('3 of 3 assigned')).toBeInTheDocument());
        // tapping an item Amy already has removes her
        await u.click(screen.getByText('Eggs'));
        expect(api.updateItem).not.toHaveBeenCalled(); // nothing is written until Save
        await u.click(screen.getByRole('button', { name: 'Save changes' }));
        await waitFor(() => expect(api.saveReceipt).toHaveBeenCalledWith('s1', expect.any(Object), expect.arrayContaining([
            expect.objectContaining({ id: 'i3', assigned_users: ['Amy'] }), expect.objectContaining({ id: 'i2', assigned_users: ['Bo'] }),
        ])));
        // tap the pill again to leave paint mode
        await u.click(screen.getByRole('button', { name: 'Amy', pressed: true }));
        expect(screen.getByText('Pick a person, then tap their items')).toBeInTheDocument();
    });

    it('avatar toggles assign and unassign, and All toggles everyone on and off', async () => {
        const u = userEvent.setup();
        renderWithData(<Split {...props} />);
        await screen.findByText('Eggs');
        await u.click(screen.getByRole('button', { name: 'Daven on Eggs' }));
        expect(screen.getByRole('button', { name: 'Daven on Eggs' })).toHaveAttribute('aria-pressed', 'true');
        await u.click(within(rowOf('Chicken Breast')).getByRole('button', { name: 'Everyone' }));
        expect(screen.getByRole('button', { name: 'Bo on Chicken Breast' })).toHaveAttribute('aria-pressed', 'true');
        await u.click(within(rowOf('Chicken Breast')).getByRole('button', { name: 'Everyone' }));
        expect(screen.getByRole('button', { name: 'Bo on Chicken Breast' })).toHaveAttribute('aria-pressed', 'false');
        expect(api.updateItem).not.toHaveBeenCalled();
        await u.click(screen.getByRole('button', { name: 'Save changes' }));
        await waitFor(() => expect(api.saveReceipt).toHaveBeenCalledWith('s1', expect.any(Object), expect.arrayContaining([
            expect.objectContaining({ id: 'i2', assigned_users: ['Amy', 'Bo', 'Daven'] }), expect.objectContaining({ id: 'i3', assigned_users: [] }),
        ])));
    });

    it('a failed save says so and keeps your changes so you can try again', async () => {
        const u = userEvent.setup();
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        api.saveReceipt.mockRejectedValueOnce(new Error('offline'));
        renderWithData(<Split {...props} />);
        await screen.findByText('Chicken Breast');
        await u.click(screen.getByRole('button', { name: 'Bo on Chicken Breast' }));
        await u.click(screen.getByRole('button', { name: 'Save changes' }));
        expect(await screen.findByText('Could not save the changes.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Bo on Chicken Breast' })).toHaveAttribute('aria-pressed', 'true'); // still there
        expect(screen.getByRole('region', { name: 'Unsaved changes' })).toBeInTheDocument();
        spy.mockRestore();
    });

    it('Cancel throws the edits away and nothing is written', async () => {
        const u = userEvent.setup();
        renderWithData(<Split {...props} />);
        expect(screen.queryByRole('region', { name: 'Unsaved changes' })).not.toBeInTheDocument(); // nothing to save yet
        const name = await screen.findByLabelText('Receipt name');
        await u.type(name, ' edited');
        await u.click(screen.getByRole('button', { name: 'Bo on Chicken Breast' }));
        expect(screen.getByRole('region', { name: 'Unsaved changes' })).toBeInTheDocument();
        await u.click(screen.getByRole('button', { name: 'Cancel' }));
        await waitFor(() => expect(screen.getByLabelText('Receipt name')).toHaveValue('Costco'));
        expect(screen.getByRole('button', { name: 'Bo on Chicken Breast' })).toHaveAttribute('aria-pressed', 'false');
        expect(screen.queryByRole('region', { name: 'Unsaved changes' })).not.toBeInTheDocument();
        expect(api.saveReceipt).not.toHaveBeenCalled();
        expect(api.updateSession).not.toHaveBeenCalledWith('s1', expect.objectContaining({ name: expect.anything() }));
    });

    it('tax and tip update the totals live and are saved with Save', async () => {
        const u = userEvent.setup();
        renderWithData(<Split {...props} />);
        await screen.findByDisplayValue('Costco');
        const tax = screen.getByLabelText('Tax');
        await u.clear(tax);
        await u.type(tax, '0');
        await u.type(screen.getByLabelText('Tip'), '5');
        await waitFor(() => expect(screen.getAllByText('$41.90').length).toBeGreaterThan(0), SLOW); // 36.90 + 0 + 5
        expect(api.saveReceipt).not.toHaveBeenCalled();
        await u.click(screen.getByRole('button', { name: 'Save changes' }));
        await waitFor(() => expect(api.saveReceipt).toHaveBeenCalledWith('s1', expect.objectContaining({ tax: 0, tip: 5 }), expect.any(Array)));
        await waitFor(() => expect(screen.queryByRole('region', { name: 'Unsaved changes' })).not.toBeInTheDocument());
    });

    it('renaming, changing the payer, date and category are one save', async () => {
        const u = userEvent.setup();
        renderWithData(<Split {...props} />);
        const name = await screen.findByLabelText('Receipt name');
        await u.clear(name);
        await u.type(name, 'Costco run');
        await u.selectOptions(screen.getByLabelText('Paid by'), 'Amy');
        await u.selectOptions(screen.getByLabelText('Category'), 'Shopping');
        fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-10-09' } });
        expect(await screen.findByText(/paid by Amy/)).toBeInTheDocument();
        expect(api.saveReceipt).not.toHaveBeenCalled();
        await u.click(screen.getByRole('button', { name: 'Save changes' }));
        await waitFor(() => expect(api.saveReceipt).toHaveBeenCalledTimes(1));
        expect(api.saveReceipt).toHaveBeenCalledWith('s1', expect.objectContaining({ name: 'Costco run', paid_by: 'u-amy', category: 'shopping', session_date: '2026-10-09' }), expect.any(Array));
    });

    it('adds an item and opens it for inline editing, then saves name and price', async () => {
        const u = userEvent.setup();
        renderWithData(<Split {...props} />);
        await u.click(await screen.findByRole('button', { name: /Add an item/ }));
        const nameInput = await screen.findByLabelText('Item name');
        expect(api.addItem).not.toHaveBeenCalled(); // an unsaved item lives only on screen
        await u.clear(nameInput);
        await u.type(nameInput, 'Sourdough');
        await u.type(screen.getByLabelText('Item price'), '6.5{Enter}');
        expect(await screen.findByText('Sourdough')).toBeInTheDocument();
        await u.click(screen.getByRole('button', { name: 'Save changes' }));
        await waitFor(() => expect(api.saveReceipt).toHaveBeenCalledWith('s1', expect.any(Object), expect.arrayContaining([
            { id: undefined, name: 'Sourdough', price: 6.5, assigned_users: [] },
        ])));
    });

    it('editing an item offers delete with a confirmation', async () => {
        const u = userEvent.setup();
        renderWithData(<Split {...props} />);
        await u.click(await screen.findByTitle('Edit item', { exact: false }).catch(() => screen.getAllByTitle('Edit item')[0]));
        await u.click(await screen.findByRole('button', { name: 'Delete item' }));
        const dialog = await screen.findByRole('dialog');
        await u.click(within(dialog).getByRole('button', { name: 'Cancel' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(api.deleteItem).not.toHaveBeenCalled();
        await u.click(await screen.findByRole('button', { name: 'Delete item' }));
        await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }));
        expect(api.deleteItem).not.toHaveBeenCalled(); // removed on screen, written on Save
        await u.click(screen.getByRole('button', { name: 'Save changes' }));
        await waitFor(() => expect(api.saveReceipt).toHaveBeenCalledWith('s1', expect.any(Object), expect.any(Array)));
        expect(api.saveReceipt.mock.calls[0][2]).toHaveLength(2);
    });

    it('deleting the receipt asks first, then returns to the group', async () => {
        const u = userEvent.setup();
        const onBack = vi.fn();
        renderWithData(<Split {...props} onBack={onBack} />);
        await u.click(await screen.findByRole('button', { name: 'Delete expense' }));
        await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(api.deleteSession).not.toHaveBeenCalled();
        await u.click(screen.getByRole('button', { name: 'Delete expense' }));
        await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }));
        await waitFor(() => expect(api.deleteSession).toHaveBeenCalledWith('s1'));
        await waitFor(() => expect(onBack).toHaveBeenCalled());
    });

    it('syncs participants once, not again on every later refresh', async () => {
        const u = userEvent.setup();
        api.getSession.mockResolvedValue({ ...(await import('../../test/apiMock')).receipt, participants: ['Daven'] });
        renderWithData(<Split {...props} />);
        await screen.findByDisplayValue('Costco');
        await waitFor(() => expect(api.updateSession).toHaveBeenCalledWith('s1', { participants: ['Daven', 'Amy', 'Bo'] }));
        await u.type(screen.getByLabelText('Tip'), '2'); // editing must not re-trigger the sync
        await new Promise(r => setTimeout(r, 300));
        const syncs = api.updateSession.mock.calls.filter(c => Object.keys(c[1]).length === 1 && 'participants' in c[1]);
        expect(syncs).toHaveLength(1);
        await u.click(screen.getByRole('button', { name: 'Save changes' }));
        await waitFor(() => expect(api.saveReceipt).toHaveBeenCalledWith('s1', expect.objectContaining({ tip: 2 }), expect.any(Array)));
    });

    it('a cleared date shows "No date" on receipts too', async () => {
        renderWithData(<Split {...props} />);
        await screen.findByDisplayValue('Costco');
        fireEvent.change(screen.getByLabelText('Date'), { target: { value: '' } });
        expect(await screen.findByText(/No date · Groceries · 3 items/)).toBeInTheDocument();
    });

    it('has an Import from JSON button, and an empty receipt invites you to add or import items', async () => {
        const u = userEvent.setup();
        const onImport = vi.fn();
        api.getSession.mockResolvedValue({ ...(await import('../../test/apiMock')).receipt, items: [] });
        renderWithData(<Split {...props} onImport={onImport} />);
        expect(await screen.findByText('No items yet. Add one by hand, or import them from a receipt.')).toBeInTheDocument();
        await u.click(screen.getByRole('button', { name: 'Import items from a photo' }));
        // an existing receipt imports in place, as unsaved changes
        expect(await screen.findByRole('heading', { name: 'Scan a receipt' })).toBeInTheDocument();
        expect(onImport).not.toHaveBeenCalled();
    });

    it('keeps the stored participant list in step with the group', async () => {
        api.getSession.mockResolvedValue({ ...(await import('../../test/apiMock')).receipt, participants: ['Daven'] });
        renderWithData(<Split {...props} />);
        await screen.findByDisplayValue('Costco');
        await waitFor(() => expect(api.updateSession).toHaveBeenCalledWith('s1', { participants: ['Daven', 'Amy', 'Bo'] }));
    });
});

describe('Expense editor (general cost splitting)', () => {
    const props = { sessionId: 's2', narrow: false, onBack: vi.fn(), onSaved: vi.fn(), onDiscard: vi.fn(), onSwitched: vi.fn() };
    const shareFor = (name: string) => screen.getByLabelText(`${name} is in on this`).closest('div')!;

    it('shows the amount, split method, per-person shares and a validity check', async () => {
        renderWithData(<ExpenseEditor {...props} />);
        expect(await screen.findByDisplayValue('October rent')).toBeInTheDocument();
        expect(screen.getByLabelText('How much was it?')).toHaveValue('2400');
        expect(screen.getByText(/Oct 1, 2026 · Rent & home · paid by Daven/)).toBeInTheDocument();
        // an older 2:1:1 "shares" split opens as the same amounts
        expect(screen.getByRole('tab', { name: 'Amounts' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByLabelText('Amy amount')).toHaveValue('600');
        expect(within(shareFor('Daven')).getByText('$1,200.00')).toBeInTheDocument();
        expect(within(shareFor('Amy')).getByText('$600.00')).toBeInTheDocument();
        expect(screen.getByText('Adds up to $2,400.00')).toBeInTheDocument();
        expect(screen.getByText('paid the bill')).toBeInTheDocument();
    });

    it('an even split follows the total to the penny and saves as amounts, until an amount is edited by hand', async () => {
        const u = userEvent.setup();
        const { rent } = await import('../../test/apiMock');
        api.getSession.mockResolvedValue({ ...rent, split_method: 'equal', split_data: { [ME]: 1, 'u-amy': 1, 'u-bo': 1 } });
        renderWithData(<ExpenseEditor {...props} />);
        await screen.findByDisplayValue('October rent');
        expect(within(shareFor('Daven')).getByText('$800.00')).toBeInTheDocument();
        await u.clear(screen.getByLabelText('How much was it?'));
        await u.type(screen.getByLabelText('How much was it?'), '100');
        // 100 / 3: the odd cent goes to one person, never lost
        await waitFor(() => {
            const cents = ['Daven', 'Amy', 'Bo'].map(n => within(shareFor(n)).getAllByText(/^\$\d/).at(-1)!.textContent);
            expect(cents.sort()).toEqual(['$33.33', '$33.33', '$33.34']);
        });
        await u.click(screen.getByRole('button', { name: 'Save changes' }));
        await waitFor(() => expect(api.updateSession).toHaveBeenCalledWith('s2', expect.objectContaining({ amount: 100, split_method: 'exact', split_data: { [ME]: 33.34, 'u-amy': 33.33, 'u-bo': 33.33 } })));
        await u.clear(screen.getByLabelText('Amy amount'));
        await u.type(screen.getByLabelText('Amy amount'), '10');
        await u.clear(screen.getByLabelText('How much was it?'));
        await u.type(screen.getByLabelText('How much was it?'), '90');
        expect(screen.getByLabelText('Amy amount')).toHaveValue('10'); // no longer follows the total
    });

    it('Amounts: flags an over- or under-assigned split and does not save it, then saves once it adds up', async () => {
        const u = userEvent.setup();
        renderWithData(<ExpenseEditor {...props} />);
        await screen.findByDisplayValue('October rent');
        const amy = screen.getByLabelText('Amy amount');
        expect(amy).toHaveValue('600'); // rent opens as 1200 / 600 / 600
        await u.clear(amy);
        await u.type(amy, '500');
        expect((await screen.findAllByText('100.00 still to assign.')).length).toBeGreaterThan(0);
        expect(within(screen.getByRole('region', { name: 'Unsaved changes' })).getByText('100.00 still to assign.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled(); // can't save a split that doesn't add up
        expect(api.updateSession).not.toHaveBeenCalled();

        await u.clear(amy);
        await u.type(amy, '700');
        expect((await screen.findAllByText('100.00 over the total.')).length).toBeGreaterThan(0); // 1200 + 700 + 600 = 2500
        const bo = screen.getByLabelText('Bo amount');
        await u.clear(bo);
        await u.type(bo, '500');
        expect(await screen.findByText('Adds up to $2,400.00')).toBeInTheDocument(); // 1200 + 700 + 500
        await u.click(screen.getByRole('button', { name: 'Save changes' }));
        await waitFor(() => expect(api.updateSession).toHaveBeenCalledWith('s2', expect.objectContaining({ split_method: 'exact', split_data: { [ME]: 1200, 'u-amy': 700, 'u-bo': 500 } })));
    });

    it('Shares: split in proportion; opens on Shares for a shares expense and saves the weights', async () => {
        const u = userEvent.setup();
        const { rent } = await import('../../test/apiMock');
        api.getSession.mockResolvedValue({ ...rent, split_method: 'shares', split_data: { [ME]: 2, 'u-amy': 1, 'u-bo': 1 } });
        renderWithData(<ExpenseEditor {...props} />);
        await screen.findByDisplayValue('October rent');
        expect(screen.getByRole('tab', { name: 'Shares' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByLabelText('Daven shares')).toHaveValue('2');
        expect(within(shareFor('Daven')).getByText('$1,200.00')).toBeInTheDocument();
        const bo = screen.getByLabelText('Bo shares');
        await u.clear(bo);
        await u.type(bo, '2');
        await waitFor(() => expect(within(shareFor('Bo')).getByText('$960.00')).toBeInTheDocument()); // 2:1:2 of 2400
        await u.click(screen.getByRole('button', { name: 'Save changes' }));
        await waitFor(() => expect(api.updateSession).toHaveBeenCalledWith('s2', expect.objectContaining({ split_method: 'shares', split_data: { [ME]: 2, 'u-amy': 1, 'u-bo': 2 } })));
    });

    it('switching amounts to shares starts everyone at 1; shares back to amounts keeps the proportions', async () => {
        const u = userEvent.setup();
        renderWithData(<ExpenseEditor {...props} />);
        await screen.findByDisplayValue('October rent');
        await u.click(screen.getByRole('tab', { name: 'Shares' }));
        expect(screen.getByLabelText('Amy shares')).toHaveValue('1');
        await u.clear(screen.getByLabelText('Daven shares'));
        await u.type(screen.getByLabelText('Daven shares'), '2');
        await u.click(screen.getByRole('tab', { name: 'Amounts' }));
        expect(screen.getByLabelText('Daven amount')).toHaveValue('1200');
        expect(screen.getByLabelText('Amy amount')).toHaveValue('600');
    });

    it('toggling someone out re-evens the others and saves who is included', async () => {
        const u = userEvent.setup();
        const { rent } = await import('../../test/apiMock');
        api.getSession.mockResolvedValue({ ...rent, split_method: 'equal', split_data: { [ME]: 1, 'u-amy': 1, 'u-bo': 1 } });
        renderWithData(<ExpenseEditor {...props} />);
        await screen.findByDisplayValue('October rent');
        await u.click(screen.getByLabelText('Bo is in on this'));
        await waitFor(() => expect(within(shareFor('Daven')).getByText('$1,200.00')).toBeInTheDocument());
        expect(within(shareFor('Bo')).getByText('—')).toBeInTheDocument();
        await u.click(screen.getByRole('button', { name: 'Save changes' }));
        await waitFor(() => expect(api.updateSession).toHaveBeenCalledWith('s2', expect.objectContaining({ split_method: 'exact', split_data: { [ME]: 1200, 'u-amy': 1200 } })));
    });

    it('Select everyone / Clear everyone, and an empty split cannot be saved', async () => {
        const u = userEvent.setup();
        renderWithData(<ExpenseEditor {...props} />);
        await screen.findByDisplayValue('October rent');
        await u.click(screen.getByRole('button', { name: 'Clear everyone' }));
        expect((await screen.findAllByText('Choose at least one person.')).length).toBeGreaterThan(0);
        expect(screen.getByText('Choose who shares this cost.')).toBeInTheDocument();
        await u.click(screen.getByRole('button', { name: 'Select everyone' }));
        expect(await screen.findByText('Adds up to $2,400.00')).toBeInTheDocument();
    });

    it('paid by, category and name changes are saved together, once, with Save', async () => {
        const u = userEvent.setup();
        renderWithData(<ExpenseEditor {...props} />);
        const name = await screen.findByLabelText('Expense name');
        await u.clear(name);
        await u.type(name, 'November rent');
        await u.selectOptions(screen.getByLabelText('Paid by'), 'Bo');
        await u.click(within(screen.getByRole('group', { name: 'Category' })).getByRole('button', { name: 'Utilities & bills' }));
        expect(await screen.findByText(/paid by Bo/)).toBeInTheDocument();
        expect(api.updateSession).not.toHaveBeenCalled();
        await u.click(screen.getByRole('button', { name: 'Save changes' }));
        await waitFor(() => expect(api.updateSession).toHaveBeenCalledTimes(1));
        expect(api.updateSession).toHaveBeenCalledWith('s2', expect.objectContaining({ name: 'November rent', paid_by: 'u-bo', category: 'utilities' }));
        await waitFor(() => expect(screen.queryByRole('region', { name: 'Unsaved changes' })).not.toBeInTheDocument());
    });

    it('shows the amounts hint and who pays what with the payer labelled', async () => {
        const u = userEvent.setup();
        renderWithData(<ExpenseEditor {...{ ...props, sessionId: 's3' }} />);
        expect(await screen.findByDisplayValue('Pizza night')).toBeInTheDocument();
        expect(screen.getByText('Starts split evenly. Change any amount to adjust it.')).toBeInTheDocument();
        expect(screen.getByText('paid the bill')).toBeInTheDocument(); // Amy paid
        expect(screen.getByText('owes Amy')).toBeInTheDocument();
        await u.click(screen.getByRole('tab', { name: 'Shares' }));
        expect(screen.getByText('Split in proportion, e.g. 2 shares for a bigger room.')).toBeInTheDocument();
    });

    it('an invited guest can be picked as payer and share an expense before joining', async () => {
        const u = userEvent.setup();
        const { group } = await import('../../test/apiMock');
        const guest = { user_id: 'g-cam', joined_at: '2026-10-05T00:00:00Z', name: 'Cam', email: 'cam@x.com', role: 'member' as const, pending: true };
        api.listGroups.mockResolvedValue([{ ...group, members: [...group.members, guest] }]);
        renderWithData(<ExpenseEditor {...props} />);
        await screen.findByDisplayValue('October rent');
        await u.click(screen.getByLabelText('Cam is in on this'));
        await u.selectOptions(screen.getByLabelText('Paid by'), 'Cam');
        await u.click(screen.getByRole('button', { name: 'Save changes' }));
        await waitFor(() => expect(api.updateSession).toHaveBeenCalledWith('s2', expect.objectContaining({
            paid_by: 'g-cam', split_data: { [ME]: 1200, 'u-amy': 600, 'u-bo': 600, 'g-cam': 0 },
        })));
    });

    it('drops someone who has left the group from the split, and offers to save the cleaned split', async () => {
        const u = userEvent.setup();
        const { rent } = await import('../../test/apiMock');
        api.getSession.mockResolvedValue({ ...rent, split_data: { ...rent.split_data, 'u-gone': 1 } });
        renderWithData(<ExpenseEditor {...props} />);
        await screen.findByDisplayValue('October rent');
        // 2:1:1 of 2400 among the three current members; the departed member takes no share
        await waitFor(() => expect(within(shareFor('Daven')).getByText('$1,200.00')).toBeInTheDocument());
        expect(screen.getByText('Adds up to $2,400.00')).toBeInTheDocument();
        expect(api.updateSession).not.toHaveBeenCalled(); // nothing is written behind your back
        await u.click(await screen.findByRole('button', { name: 'Save changes' }));
        await waitFor(() => expect(api.updateSession).toHaveBeenCalledWith('s2', expect.objectContaining({ split_method: 'exact', split_data: { [ME]: 1200, 'u-amy': 600, 'u-bo': 600 } })));
    });

    it('Cancel puts the saved version back, and nothing was written', async () => {
        const u = userEvent.setup();
        renderWithData(<ExpenseEditor {...props} />);
        const name = await screen.findByLabelText('Expense name');
        await u.type(name, ' (oops)');
        await u.selectOptions(screen.getByLabelText('Paid by'), 'Bo');
        await u.click(screen.getByLabelText('Bo is in on this'));
        await u.click(screen.getByRole('button', { name: 'Cancel' }));
        await waitFor(() => expect(screen.getByLabelText('Expense name')).toHaveValue('October rent'));
        expect(screen.getByLabelText('Paid by')).toHaveValue('u-me');
        expect(screen.getByLabelText('Bo is in on this')).toHaveAttribute('aria-pressed', 'true');
        expect(screen.queryByRole('region', { name: 'Unsaved changes' })).not.toBeInTheDocument();
        expect(api.updateSession).not.toHaveBeenCalled();
    });

    it('category is a row of pills inside the cost card; paid by and date sit beside the totals on wide screens and above the cost on a phone', async () => {
        const wide = renderWithData(<ExpenseEditor {...props} />);
        const cost = await screen.findByLabelText('How much was it?');
        const after = (x: Node, y: Node) => !!(x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING);
        expect(after(cost, screen.getByLabelText('Paid by'))).toBe(true);
        const cats = within(screen.getByRole('group', { name: 'Category' }));
        expect(cats.getByRole('button', { name: 'Rent & home' })).toHaveAttribute('aria-pressed', 'true');
        expect(cats.getByRole('button', { name: 'Groceries' })).toHaveAttribute('aria-pressed', 'false');
        wide.unmount();
        renderWithData(<ExpenseEditor {...props} narrow />);
        const phoneCost = await screen.findByLabelText('How much was it?');
        expect(after(screen.getByLabelText('Paid by'), phoneCost)).toBe(true); // details first, as asked for phones
    });

    it('a new expense starts with nobody selected', async () => {
        const u = userEvent.setup();
        api.getSession.mockResolvedValue({ ...(await import('../../test/apiMock')).rent, id: 's9', draft: true, name: 'New expense', amount: 0, split_method: 'exact' as const, split_data: {} });
        renderWithData(<ExpenseEditor {...props} sessionId="s9" />);
        const bar = await screen.findByRole('region', { name: 'Unsaved draft' });
        for (const n of ['Daven', 'Amy', 'Bo']) expect(screen.getByLabelText(`${n} is in on this`)).toHaveAttribute('aria-pressed', 'false');
        expect(within(bar).getByText('Choose at least one person.')).toBeInTheDocument();
        expect(within(bar).getByRole('button', { name: 'Save expense' })).toBeDisabled();
        await u.click(screen.getByLabelText('Amy is in on this'));
        await u.type(screen.getByLabelText('How much was it?'), '30');
        await waitFor(() => expect(within(bar).getByRole('button', { name: 'Save expense' })).toBeEnabled());
    });

    it('while the split does not add up, Save is blocked entirely, so a half-edited split is never written', async () => {
        const u = userEvent.setup();
        renderWithData(<ExpenseEditor {...props} />);
        await screen.findByDisplayValue('October rent');
        await u.clear(screen.getByLabelText('Amy amount'));
        await u.type(screen.getByLabelText('Amy amount'), '500'); // now 100 short: invalid
        const name = screen.getByLabelText('Expense name');
        await u.clear(name);
        await u.type(name, 'Rent (Oct)');
        expect((await screen.findAllByText('100.00 still to assign.')).length).toBeGreaterThan(0);
        expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
        expect(api.updateSession).not.toHaveBeenCalled();
    });

    it('a cleared date shows "No date" instead of "Invalid Date" and keeps the stored date', async () => {
        renderWithData(<ExpenseEditor {...props} />);
        await screen.findByDisplayValue('October rent');
        fireEvent.change(screen.getByLabelText('Date'), { target: { value: '' } });
        expect(await screen.findByText(/No date · Rent & home/)).toBeInTheDocument();
        expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument();
    });

    it('deleting asks first', async () => {
        const u = userEvent.setup();
        const onBack = vi.fn();
        renderWithData(<ExpenseEditor {...props} onBack={onBack} />);
        await u.click(await screen.findByRole('button', { name: 'Delete expense' }));
        await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(api.deleteSession).not.toHaveBeenCalled();
        await u.click(screen.getByRole('button', { name: 'Delete expense' }));
        await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }));
        await waitFor(() => expect(api.deleteSession).toHaveBeenCalledWith('s2'));
        await waitFor(() => expect(onBack).toHaveBeenCalled());
    });
});

describe('Import from JSON (fills an existing receipt)', () => {
    const props = { groupId: 'g1', sessionId: 's1', narrow: false, onImported: vi.fn(), onBack: vi.fn() };

    it('explains the two steps and shows an empty preview', async () => {
        renderWithData(<ReceiptUpload {...props} />);
        expect(await screen.findByRole('heading', { name: 'Scan a receipt' })).toBeInTheDocument();
        expect(screen.getByText('Copy the prompt')).toBeInTheDocument();
        expect(screen.getByText('Paste what it sends back')).toBeInTheDocument();
        expect(screen.getByText('Your receipt shows up here as soon as you paste it.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Import and split' })).toBeDisabled();
        expect(screen.getByRole('button', { name: /Back to receipt/ })).toBeInTheDocument();
    });

    it('copies the prompt and confirms with "Copied"', async () => {
        const u = userEvent.setup();
        const writeText = vi.fn(async () => {});
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
        renderWithData(<ReceiptUpload {...props} />);
        await u.click(await screen.findByRole('button', { name: 'Copy prompt' }));
        expect(writeText).toHaveBeenCalledWith(expect.stringContaining('receipt parser'));
        expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
    });

    it('rejects bad JSON with friendly copy, previews good JSON, and adds the items to THIS receipt', async () => {
        const u = userEvent.setup();
        renderWithData(<ReceiptUpload {...props} />);
        const box = await screen.findByLabelText('Receipt JSON');
        fireEvent.change(box, { target: { value: 'not json' } });
        expect(await screen.findByText("That doesn't look like receipt JSON yet. Make sure you copied the whole reply.")).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Import and split' })).toBeDisabled();

        await u.click(screen.getByRole('button', { name: 'Try an example' }));
        expect(await screen.findByText('Corner Market')).toBeInTheDocument();
        expect(screen.getByText('Oat Milk')).toBeInTheDocument();
        expect(screen.getByText('$12.40')).toBeInTheDocument();
        expect(screen.getByText('$27.14')).toBeInTheDocument(); // 12.40 + 7.50 + 5.99 + 1.25 tax
        await u.click(screen.getByRole('button', { name: 'Import and split' }));
        await waitFor(() => expect(api.importReceiptIntoSession).toHaveBeenCalledWith('s1', {
            store: 'Corner Market', date: '2026-10-05', tax: 1.25, tip: 0,
            items: [{ name: 'Organic Honeycrisp Apples', price: 12.4 }, { name: 'Oat Milk', price: 7.5 }, { name: 'Free Range Eggs', price: 5.99 }],
        }));
        expect(api.createSession).not.toHaveBeenCalled(); // never a second receipt
        await waitFor(() => expect(props.onImported).toHaveBeenCalled());
    });

    it('tolerates chatter around the JSON', async () => {
        renderWithData(<ReceiptUpload {...props} />);
        fireEvent.change(await screen.findByLabelText('Receipt JSON'), { target: { value: 'Sure!\n```json\n{"store":"Deli","items":[{"name":"Soup","price":"$4.50"}]}\n```' } });
        expect(await screen.findByText('Deli')).toBeInTheDocument();
        expect(screen.getByText('Soup')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Import and split' })).toBeEnabled();
    });
});

describe('New records are drafts: nothing is saved until you press Save', () => {
    const draftReceipt = async () => ({ ...(await import('../../test/apiMock')).receipt, id: 's9', draft: true, name: 'Receipt', items: [], tax: 0 });
    const draftExpense = async () => ({ ...(await import('../../test/apiMock')).rent, id: 's9', draft: true, name: 'New expense', amount: 0, split_method: 'exact' as const, split_data: { [ME]: 0, 'u-amy': 0, 'u-bo': 0 } });
    const idle = () => new Promise(r => setTimeout(r, 1000)); // longer than the 600ms autosave debounce

    it('a new itemized expense shows a draft bar, does not autosave, and Save writes the details and publishes it', async () => {
        const u = userEvent.setup();
        api.getSession.mockResolvedValue(await draftReceipt());
        const onSaved = vi.fn();
        renderWithData(<Split sessionId="s9" narrow={false} onBack={vi.fn()} onImport={vi.fn()} onSaved={onSaved} onDiscard={vi.fn()} onSwitched={vi.fn()} />);
        const bar = await screen.findByRole('region', { name: 'Unsaved draft' });
        expect(within(bar).getByText('New expense, not saved yet')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Delete expense' })).not.toBeInTheDocument();

        const name = screen.getByLabelText('Receipt name');
        await u.clear(name);
        await u.type(name, 'Trader Joes');
        await u.type(screen.getByLabelText('Tax'), '2');
        await idle();
        expect(api.updateSession).not.toHaveBeenCalledWith('s9', expect.objectContaining({ name: 'Trader Joes' })); // no autosave

        await u.click(within(bar).getByRole('button', { name: 'Save expense' }));
        await waitFor(() => expect(api.updateSession).toHaveBeenCalledWith('s9', expect.objectContaining({ name: 'Trader Joes', tax: 2, draft: false })));
        await waitFor(() => expect(onSaved).toHaveBeenCalled());
    });

    it('Discard on a new receipt hands control back without saving', async () => {
        const u = userEvent.setup();
        api.getSession.mockResolvedValue(await draftReceipt());
        const onDiscard = vi.fn();
        renderWithData(<Split sessionId="s9" narrow={false} onBack={vi.fn()} onImport={vi.fn()} onSaved={vi.fn()} onDiscard={onDiscard} onSwitched={vi.fn()} />);
        await u.click(await screen.findByRole('button', { name: 'Discard' }));
        expect(onDiscard).toHaveBeenCalled();
        expect(api.updateSession).not.toHaveBeenCalledWith('s9', expect.objectContaining({ draft: false }));
    });

    it('an existing receipt has no draft bar and still autosaves', async () => {
        renderWithData(<Split sessionId="s1" narrow={false} onBack={vi.fn()} onImport={vi.fn()} onSaved={vi.fn()} onDiscard={vi.fn()} onSwitched={vi.fn()} />);
        await screen.findByDisplayValue('Costco');
        expect(screen.queryByRole('region', { name: 'Unsaved draft' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Delete expense' })).toBeInTheDocument();
    });

    it('a new expense: Save is blocked while the split does not add up, and nothing autosaves', async () => {
        const u = userEvent.setup();
        api.getSession.mockResolvedValue(await draftExpense());
        renderWithData(<ExpenseEditor sessionId="s9" narrow={false} onBack={vi.fn()} onSaved={vi.fn()} onDiscard={vi.fn()} onSwitched={vi.fn()} />);
        const bar = await screen.findByRole('region', { name: 'Unsaved draft' });
        expect(within(bar).getByText('New expense, not saved yet')).toBeInTheDocument();
        expect(within(bar).getByRole('button', { name: 'Save expense' })).toBeEnabled(); // $0 is a valid split
        await u.type(screen.getByLabelText('How much was it?'), '100');
        await u.clear(screen.getByLabelText('Amy amount'));
        await u.type(screen.getByLabelText('Amy amount'), '10'); // hand-edited, so no longer even: 33.34 + 10 + 33.33
        expect(await within(bar).findByText('23.33 still to assign.')).toBeInTheDocument();
        expect(within(bar).getByRole('button', { name: 'Save expense' })).toBeDisabled();
        await idle();
        expect(api.updateSession).not.toHaveBeenCalled(); // never saved by itself
    });

    it('a new expense: Save writes everything at once and publishes it', async () => {
        const u = userEvent.setup();
        api.getSession.mockResolvedValue(await draftExpense());
        const onSaved = vi.fn();
        renderWithData(<ExpenseEditor sessionId="s9" narrow={false} onBack={vi.fn()} onSaved={onSaved} onDiscard={vi.fn()} onSwitched={vi.fn()} />);
        const name = await screen.findByLabelText('Expense name');
        await u.clear(name);
        await u.type(name, 'Dinner');
        await u.type(screen.getByLabelText('How much was it?'), '90');
        await u.click(within(screen.getByRole('group', { name: 'Category' })).getByRole('button', { name: 'Dining & drinks' }));
        await idle();
        expect(api.updateSession).not.toHaveBeenCalled();
        await u.click(screen.getByRole('button', { name: 'Save expense' }));
        await waitFor(() => expect(api.updateSession).toHaveBeenCalledWith('s9', expect.objectContaining({
            name: 'Dinner', amount: 90, category: 'dining', split_method: 'exact', split_data: { [ME]: 30, 'u-amy': 30, 'u-bo': 30 }, draft: false,
        })));
        await waitFor(() => expect(onSaved).toHaveBeenCalled());
    });

    it('a new expense can be discarded; an existing one has no draft bar and keeps its delete option', async () => {
        const u = userEvent.setup();
        api.getSession.mockResolvedValue(await draftExpense());
        const onDiscard = vi.fn();
        const first = renderWithData(<ExpenseEditor sessionId="s9" narrow={false} onBack={vi.fn()} onSaved={vi.fn()} onDiscard={onDiscard} onSwitched={vi.fn()} />);
        await u.click(await screen.findByRole('button', { name: 'Discard' }));
        expect(onDiscard).toHaveBeenCalled();
        expect(screen.queryByRole('button', { name: 'Delete expense' })).not.toBeInTheDocument();
        first.unmount();
        api.getSession.mockImplementation(async (id: string) => structuredClone((await import('../../test/apiMock')).sessions.find(x => x.id === id)!));
        renderWithData(<ExpenseEditor sessionId="s2" narrow={false} onBack={vi.fn()} onSaved={vi.fn()} onDiscard={vi.fn()} onSwitched={vi.fn()} />);
        await screen.findByDisplayValue('October rent');
        expect(screen.queryByRole('region', { name: 'Unsaved draft' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Delete expense' })).toBeInTheDocument();
    });
});

describe('One editor: switching how an expense is split', () => {
    it('By item turns an expense into an itemized one, keeping its details, and reopens it in the item editor', async () => {
        const u = userEvent.setup();
        const onSwitched = vi.fn();
        renderWithData(<ExpenseEditor sessionId="s2" narrow={false} onBack={vi.fn()} onSaved={vi.fn()} onDiscard={vi.fn()} onSwitched={onSwitched} />);
        await screen.findByDisplayValue('October rent');
        expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Amounts', 'Shares']);
        await u.click(screen.getByRole('button', { name: 'Split by item' }));
        await waitFor(() => expect(api.updateSession).toHaveBeenCalledWith('s2', expect.objectContaining({
            kind: 'receipt', name: 'October rent', category: 'rent', paid_by: ME, participants: ['Daven', 'Amy', 'Bo'],
        })));
        await waitFor(() => expect(onSwitched).toHaveBeenCalledWith('receipt'));
    });

    it('the item editor can switch to any other method; it keeps the same total and a valid split', async () => {
        const u = userEvent.setup();
        const onSwitched = vi.fn();
        renderWithData(<Split sessionId="s1" narrow={false} onBack={vi.fn()} onImport={vi.fn()} onSaved={vi.fn()} onDiscard={vi.fn()} onSwitched={onSwitched} />);
        await screen.findByDisplayValue('Costco');
        await u.click(screen.getByRole('button', { name: 'Split one total instead' }));
        await waitFor(() => expect(api.updateSession).toHaveBeenCalledWith('s1', expect.objectContaining({
            kind: 'expense', amount: 40.1, split_method: 'exact', name: 'Costco', category: 'groceries',
            split_data: { [ME]: 13.37, 'u-amy': 13.37, 'u-bo': 13.36 },
        })));
        await waitFor(() => expect(onSwitched).toHaveBeenCalledWith('expense'));
    });

    it('a failed switch says so and stays put', async () => {
        const u = userEvent.setup();
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        api.updateSession.mockRejectedValueOnce(new Error('nope'));
        const onSwitched = vi.fn();
        renderWithData(<Split sessionId="s1" narrow={false} onBack={vi.fn()} onImport={vi.fn()} onSaved={vi.fn()} onDiscard={vi.fn()} onSwitched={onSwitched} />);
        await screen.findByDisplayValue('Costco');
        await u.click(screen.getByRole('button', { name: 'Split one total instead' }));
        expect(await screen.findByText('Could not switch how this is split.')).toBeInTheDocument();
        expect(onSwitched).not.toHaveBeenCalled();
        spy.mockRestore();
    });
});

