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
        expect(screen.getByText(/Oct 1, 2026 · 3 items · paid by you/)).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'By item', selected: true })).toBeInTheDocument(); // the Split by control, on By item
        expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Equally', 'Amounts', 'Percent', 'Shares', 'By item']);
        expect(screen.getByText('Pick a person, then tap their items')).toBeInTheDocument();
        expect(screen.getByText('2 of 3 assigned')).toBeInTheDocument();
        expect(screen.getByText('Oat Milk')).toBeInTheDocument();
        expect(screen.getByText('$4.00 each')).toBeInTheDocument();
        expect(screen.getByText('Not assigned yet', { selector: 'span.text-coral' })).toBeInTheDocument();
        // Who pays what, with tax shared in proportion
        await waitFor(() => expect(screen.getByText('$4.88')).toBeInTheDocument(), SLOW);
        expect(screen.getByText('$8.85')).toBeInTheDocument();
        expect(screen.getByText('$3.97')).toBeInTheDocument();
        expect(screen.getByText('paid the bill')).toBeInTheDocument();
        expect(screen.getAllByText('owes you')).toHaveLength(2);
        expect(screen.getByText('Tax and tip are shared in proportion to what each person had. Pennies always add up.')).toBeInTheDocument();
    });

    it('paint mode: pick a person, then tap rows to toggle them', async () => {
        const u = userEvent.setup();
        renderWithData(<Split {...props} />);
        await screen.findByText('Chicken Breast');
        await u.click(screen.getByRole('button', { name: 'Amy', pressed: false }));
        expect(screen.getByText('Tap the items Amy had')).toBeInTheDocument();
        await u.click(screen.getByText('Chicken Breast'));
        await waitFor(() => expect(api.updateItem).toHaveBeenCalledWith('s1', 'i3', { assigned_users: ['Amy'] }));
        await waitFor(() => expect(screen.getByText('3 of 3 assigned')).toBeInTheDocument());
        // tapping an item Amy already has removes her
        await u.click(screen.getByText('Eggs'));
        await waitFor(() => expect(api.updateItem).toHaveBeenCalledWith('s1', 'i2', { assigned_users: ['Bo'] }));
        // tap the pill again to leave paint mode
        await u.click(screen.getByRole('button', { name: 'Amy', pressed: true }));
        expect(screen.getByText('Pick a person, then tap their items')).toBeInTheDocument();
    });

    it('avatar toggles assign and unassign, and All toggles everyone on and off', async () => {
        const u = userEvent.setup();
        renderWithData(<Split {...props} />);
        await screen.findByText('Eggs');
        await u.click(screen.getByRole('button', { name: 'Daven on Eggs' }));
        await waitFor(() => expect(api.updateItem).toHaveBeenCalledWith('s1', 'i2', { assigned_users: ['Amy', 'Bo', 'Daven'] }));
        await u.click(within(rowOf('Chicken Breast')).getByRole('button', { name: 'All' }));
        await waitFor(() => expect(api.updateItem).toHaveBeenCalledWith('s1', 'i3', { assigned_users: ['Daven', 'Amy', 'Bo'] }));
        await u.click(within(rowOf('Chicken Breast')).getByRole('button', { name: 'All' }));
        await waitFor(() => expect(api.updateItem).toHaveBeenLastCalledWith('s1', 'i3', { assigned_users: [] }));
    });

    it('rolls back an assignment and says so when saving fails', async () => {
        const u = userEvent.setup();
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        api.updateItem.mockRejectedValueOnce(new Error('offline'));
        renderWithData(<Split {...props} />);
        await screen.findByText('Chicken Breast');
        await u.click(screen.getByRole('button', { name: 'Bo on Chicken Breast' }));
        expect(await screen.findByText('Could not save that change.')).toBeInTheDocument();
        await waitFor(() => expect(screen.getByRole('button', { name: 'Bo on Chicken Breast' })).toHaveAttribute('aria-pressed', 'false'));
        spy.mockRestore();
    });

    it('tax and tip update the totals live and autosave', async () => {
        const u = userEvent.setup();
        renderWithData(<Split {...props} />);
        await screen.findByDisplayValue('Costco');
        const tax = screen.getByLabelText('Tax');
        await u.clear(tax);
        await u.type(tax, '0');
        await u.type(screen.getByLabelText('Tip'), '5');
        await waitFor(() => expect(screen.getAllByText('$41.90').length).toBeGreaterThan(0), SLOW); // 36.90 + 0 + 5
        await waitFor(() => expect(api.updateSession).toHaveBeenCalledWith('s1', expect.objectContaining({ tax: 0, tip: 5 })), SLOW);
        expect(await screen.findByText('All changes saved')).toBeInTheDocument();
    });

    it('renaming, changing the payer, date and category all autosave (no save button)', async () => {
        const u = userEvent.setup();
        renderWithData(<Split {...props} />);
        const name = await screen.findByLabelText('Receipt name');
        await u.clear(name);
        await u.type(name, 'Costco run');
        await u.selectOptions(screen.getByLabelText('Paid by'), 'Amy');
        await u.selectOptions(screen.getByLabelText('Category'), 'Shopping');
        fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-10-09' } });
        await waitFor(() => expect(api.updateSession).toHaveBeenCalledWith('s1', expect.objectContaining({ name: 'Costco run', paid_by: 'u-amy', category: 'shopping', session_date: '2026-10-09' })), SLOW);
        expect(screen.queryByRole('button', { name: /Save/ })).not.toBeInTheDocument();
        expect(await screen.findByText(/paid by Amy/)).toBeInTheDocument();
    });

    it('adds an item and opens it for inline editing, then saves name and price', async () => {
        const u = userEvent.setup();
        renderWithData(<Split {...props} />);
        await u.click(await screen.findByRole('button', { name: /Add an item/ }));
        await waitFor(() => expect(api.addItem).toHaveBeenCalledWith('s1', 'New item', 0));
        const nameInput = await screen.findByLabelText('Item name');
        await u.clear(nameInput);
        await u.type(nameInput, 'Sourdough');
        await u.type(screen.getByLabelText('Item price'), '6.5{Enter}');
        await waitFor(() => expect(api.updateItem).toHaveBeenCalledWith('s1', 'i9', { name: 'Sourdough', price: 6.5 }));
        expect(await screen.findByText('Sourdough')).toBeInTheDocument();
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
        await waitFor(() => expect(api.deleteItem).toHaveBeenCalledWith('s1', expect.any(String)));
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
        await u.type(screen.getByLabelText('Tip'), '2'); // autosave -> refresh() -> new group objects
        await waitFor(() => expect(api.updateSession).toHaveBeenCalledWith('s1', expect.objectContaining({ tip: 2 })), SLOW);
        await new Promise(r => setTimeout(r, 300));
        const syncs = api.updateSession.mock.calls.filter(c => Object.keys(c[1]).length === 1 && 'participants' in c[1]);
        expect(syncs).toHaveLength(1);
    });

    it('a cleared date shows "No date" on receipts too', async () => {
        renderWithData(<Split {...props} />);
        await screen.findByDisplayValue('Costco');
        fireEvent.change(screen.getByLabelText('Date'), { target: { value: '' } });
        expect(await screen.findByText(/No date · 3 items/)).toBeInTheDocument();
    });

    it('has an Import from JSON button, and an empty receipt invites you to add or import items', async () => {
        const u = userEvent.setup();
        const onImport = vi.fn();
        api.getSession.mockResolvedValue({ ...(await import('../../test/apiMock')).receipt, items: [] });
        renderWithData(<Split {...props} onImport={onImport} />);
        expect(await screen.findByText('No items yet. Add one by hand, or import them from a receipt.')).toBeInTheDocument();
        await u.click(screen.getByRole('button', { name: /Import from JSON/ }));
        expect(onImport).toHaveBeenCalled();
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
        expect(screen.getByText(/Oct 1, 2026 · Rent & home · paid by you/)).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Shares' })).toHaveAttribute('aria-selected', 'true');
        expect(within(shareFor('Daven')).getByText('$1,200.00')).toBeInTheDocument();
        expect(within(shareFor('Amy')).getByText('$600.00')).toBeInTheDocument();
        expect(screen.getByText('Adds up to $2,400.00')).toBeInTheDocument();
        expect(screen.getByText('paid the bill')).toBeInTheDocument();
    });

    it('switching to Equally splits evenly, to the penny', async () => {
        const u = userEvent.setup();
        renderWithData(<ExpenseEditor {...props} />);
        await screen.findByDisplayValue('October rent');
        await u.click(screen.getByRole('tab', { name: 'Equally' }));
        expect(within(shareFor('Daven')).getByText('$800.00')).toBeInTheDocument();
        await u.clear(screen.getByLabelText('How much was it?'));
        await u.type(screen.getByLabelText('How much was it?'), '100');
        // 100 / 3: the odd cent goes to one person, never lost
        await waitFor(() => {
            const cents = ['Daven', 'Amy', 'Bo'].map(n => within(shareFor(n)).getByText(/^\$/).textContent);
            expect(cents.sort()).toEqual(['$33.33', '$33.33', '$33.34']);
        });
        await waitFor(() => expect(api.updateSession).toHaveBeenCalledWith('s2', expect.objectContaining({ amount: 100, split_method: 'equal', split_data: { [ME]: 1, 'u-amy': 1, 'u-bo': 1 } })), SLOW);
    });

    it('Amounts: flags an over- or under-assigned split and does not save it, then saves once it adds up', async () => {
        const u = userEvent.setup();
        renderWithData(<ExpenseEditor {...props} />);
        await screen.findByDisplayValue('October rent');
        await u.click(screen.getByRole('tab', { name: 'Amounts' }));
        const amy = screen.getByLabelText('Amy amount');
        expect(amy).toHaveValue('800');
        await u.clear(amy);
        await u.type(amy, '700');
        expect(await screen.findByText('100.00 still to assign.')).toBeInTheDocument();
        expect(screen.getByText('Not saved yet: 100.00 still to assign.')).toBeInTheDocument();
        await new Promise(r => setTimeout(r, 900)); // longer than the debounce
        expect(api.updateSession).not.toHaveBeenCalled();

        await u.clear(amy);
        await u.type(amy, '900');
        expect(await screen.findByText('100.00 over the total.')).toBeInTheDocument(); // 800 + 900 + 800 = 2500
        const bo = screen.getByLabelText('Bo amount');
        await u.clear(bo);
        await u.type(bo, '700');
        expect(await screen.findByText('Adds up to $2,400.00')).toBeInTheDocument(); // 800 + 900 + 700
        await waitFor(() => expect(api.updateSession).toHaveBeenCalledWith('s2', expect.objectContaining({ split_method: 'exact', split_data: { [ME]: 800, 'u-amy': 900, 'u-bo': 700 } })), SLOW);
    });

    it('Percent: must add up to 100', async () => {
        const u = userEvent.setup();
        renderWithData(<ExpenseEditor {...props} />);
        await screen.findByDisplayValue('October rent');
        await u.click(screen.getByRole('tab', { name: 'Percent' }));
        expect(await screen.findByText('Adds up to $2,400.00')).toBeInTheDocument(); // seeded 33.34 / 33.33 / 33.33
        const bo = screen.getByLabelText('Bo percent');
        await u.clear(bo);
        await u.type(bo, '50');
        expect(await screen.findByText('16.67% over 100.')).toBeInTheDocument();
    });

    it('toggling someone out recomputes everyone else and saves who is included', async () => {
        const u = userEvent.setup();
        renderWithData(<ExpenseEditor {...props} />);
        await screen.findByDisplayValue('October rent');
        await u.click(screen.getByLabelText('Bo is in on this'));
        await waitFor(() => expect(within(shareFor('Daven')).getByText('$1,600.00')).toBeInTheDocument());
        expect(within(shareFor('Bo')).getByText('—')).toBeInTheDocument();
        await waitFor(() => expect(api.updateSession).toHaveBeenCalledWith('s2', expect.objectContaining({ split_data: { [ME]: 2, 'u-amy': 1 } })), SLOW);
    });

    it('Select everyone / Clear everyone, and an empty split cannot be saved', async () => {
        const u = userEvent.setup();
        renderWithData(<ExpenseEditor {...props} />);
        await screen.findByDisplayValue('October rent');
        await u.click(screen.getByRole('button', { name: 'Clear everyone' }));
        expect(await screen.findByText('Choose at least one person.')).toBeInTheDocument();
        expect(screen.getByText('Choose who shares this cost.')).toBeInTheDocument();
        await u.click(screen.getByRole('button', { name: 'Select everyone' }));
        expect(await screen.findByText('Adds up to $2,400.00')).toBeInTheDocument();
    });

    it('paid by, category and name changes autosave', async () => {
        const u = userEvent.setup();
        renderWithData(<ExpenseEditor {...props} />);
        const name = await screen.findByLabelText('Expense name');
        await u.clear(name);
        await u.type(name, 'November rent');
        await u.selectOptions(screen.getByLabelText('Paid by'), 'Bo');
        await u.selectOptions(screen.getByLabelText('Category'), 'utilities');
        await waitFor(() => expect(api.updateSession).toHaveBeenCalledWith('s2', expect.objectContaining({ name: 'November rent', paid_by: 'u-bo', category: 'utilities' })), SLOW);
        expect(await screen.findByText(/paid by Bo/)).toBeInTheDocument();
    });

    it('shows the equal-split hint and who pays what with the payer labelled', async () => {
        const u = userEvent.setup();
        renderWithData(<ExpenseEditor {...{ ...props, sessionId: 's3' }} />);
        expect(await screen.findByDisplayValue('Pizza night')).toBeInTheDocument();
        expect(screen.getByText('Everyone ticked pays the same.')).toBeInTheDocument();
        expect(screen.getByText('paid the bill')).toBeInTheDocument(); // Amy paid
        expect(screen.getByText('owes Amy')).toBeInTheDocument();
        await u.click(screen.getByRole('tab', { name: 'Shares' }));
        expect(screen.getByText('Split in proportion, e.g. 2 shares for a bigger room.')).toBeInTheDocument();
    });

    it('drops someone who has left the group from the split, and saves the cleaned split', async () => {
        const { rent } = await import('../../test/apiMock');
        api.getSession.mockResolvedValue({ ...rent, split_data: { ...rent.split_data, 'u-gone': 1 } });
        renderWithData(<ExpenseEditor {...props} />);
        await screen.findByDisplayValue('October rent');
        // 2:1:1 of 2400 among the three current members; the departed member takes no share
        expect(within(shareFor('Daven')).getByText('$1,200.00')).toBeInTheDocument();
        expect(screen.getByText('Adds up to $2,400.00')).toBeInTheDocument();
        await waitFor(() => expect(api.updateSession).toHaveBeenCalledWith('s2', expect.objectContaining({ split_data: { [ME]: 2, 'u-amy': 1, 'u-bo': 1 } })), SLOW);
    });

    it('edits to the name, payer and category still save while the split is invalid, without writing the split', async () => {
        const u = userEvent.setup();
        renderWithData(<ExpenseEditor {...props} />);
        await screen.findByDisplayValue('October rent');
        await u.click(screen.getByRole('tab', { name: 'Amounts' }));
        await u.clear(screen.getByLabelText('Amy amount'));
        await u.type(screen.getByLabelText('Amy amount'), '700'); // now 100 short: invalid
        expect(await screen.findByText('100.00 still to assign.')).toBeInTheDocument();
        const name = screen.getByLabelText('Expense name');
        await u.clear(name);
        await u.type(name, 'Rent (Oct)');
        await u.selectOptions(screen.getByLabelText('Paid by'), 'Amy');
        await waitFor(() => expect(api.updateSession).toHaveBeenCalledTimes(1), SLOW);
        const patch = api.updateSession.mock.calls[0][1];
        expect(patch).toMatchObject({ name: 'Rent (Oct)', paid_by: 'u-amy' });
        expect(patch).not.toHaveProperty('split_data');
        expect(patch).not.toHaveProperty('amount');
        expect(patch).not.toHaveProperty('split_method');
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
        expect(await screen.findByRole('heading', { name: 'Import from JSON' })).toBeInTheDocument();
        expect(screen.getByText('Copy the prompt')).toBeInTheDocument();
        expect(screen.getByText('Paste what it sends back')).toBeInTheDocument();
        expect(screen.getByText('Your receipt shows up here as soon as you paste it.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Add to receipt' })).toBeDisabled();
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
        expect(screen.getByRole('button', { name: 'Add to receipt' })).toBeDisabled();

        await u.click(screen.getByRole('button', { name: 'Try an example' }));
        expect(await screen.findByText('Corner Market')).toBeInTheDocument();
        expect(screen.getByText('Oat Milk')).toBeInTheDocument();
        expect(screen.getByText('$12.40')).toBeInTheDocument();
        expect(screen.getByText('$27.14')).toBeInTheDocument(); // 12.40 + 7.50 + 5.99 + 1.25 tax
        await u.click(screen.getByRole('button', { name: 'Add to receipt' }));
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
        expect(screen.getByRole('button', { name: 'Add to receipt' })).toBeEnabled();
    });
});

describe('New records are drafts: nothing is saved until you press Save', () => {
    const draftReceipt = async () => ({ ...(await import('../../test/apiMock')).receipt, id: 's9', draft: true, name: 'Receipt', items: [], tax: 0 });
    const draftExpense = async () => ({ ...(await import('../../test/apiMock')).rent, id: 's9', draft: true, name: 'New expense', amount: 0, split_method: 'equal' as const, split_data: { [ME]: 1, 'u-amy': 1, 'u-bo': 1 } });
    const idle = () => new Promise(r => setTimeout(r, 1000)); // longer than the 600ms autosave debounce

    it('a new itemized expense shows a draft bar, does not autosave, and Save writes the details and publishes it', async () => {
        const u = userEvent.setup();
        api.getSession.mockResolvedValue(await draftReceipt());
        const onSaved = vi.fn();
        renderWithData(<Split sessionId="s9" narrow={false} onBack={vi.fn()} onImport={vi.fn()} onSaved={onSaved} onDiscard={vi.fn()} onSwitched={vi.fn()} />);
        const bar = await screen.findByRole('region', { name: 'Unsaved draft' });
        expect(within(bar).getByText('New expense, not saved yet')).toBeInTheDocument();
        expect(screen.getByText('Not saved yet')).toBeInTheDocument();
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
        expect(within(bar).getByRole('button', { name: 'Save expense' })).toBeEnabled(); // $0 split equally is valid
        await u.click(screen.getByRole('tab', { name: 'Amounts' }));
        await u.type(screen.getByLabelText('How much was it?'), '100'); // amounts are still 0 each: 100.00 to assign
        expect(await within(bar).findByText('100.00 still to assign.')).toBeInTheDocument();
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
        await u.selectOptions(screen.getByLabelText('Category'), 'dining');
        await idle();
        expect(api.updateSession).not.toHaveBeenCalled();
        await u.click(screen.getByRole('button', { name: 'Save expense' }));
        await waitFor(() => expect(api.updateSession).toHaveBeenCalledWith('s9', expect.objectContaining({
            name: 'Dinner', amount: 90, category: 'dining', split_method: 'equal', split_data: { [ME]: 1, 'u-amy': 1, 'u-bo': 1 }, draft: false,
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
        expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Equally', 'Amounts', 'Percent', 'Shares', 'By item']);
        await u.click(screen.getByRole('tab', { name: 'By item' }));
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
        await u.click(screen.getByRole('tab', { name: 'Percent' }));
        await waitFor(() => expect(api.updateSession).toHaveBeenCalledWith('s1', expect.objectContaining({
            kind: 'expense', amount: 40.1, split_method: 'percent', name: 'Costco', category: 'groceries',
            split_data: { [ME]: 33.34, 'u-amy': 33.33, 'u-bo': 33.33 },
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
        await u.click(screen.getByRole('tab', { name: 'Equally' }));
        expect(await screen.findByText('Could not switch how this is split.')).toBeInTheDocument();
        expect(onSwitched).not.toHaveBeenCalled();
        spy.mockRestore();
    });
});

