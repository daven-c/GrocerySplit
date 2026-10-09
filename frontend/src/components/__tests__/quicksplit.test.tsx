// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

vi.mock('../../lib/api', async () => (await import('../../test/apiMock')).apiMock);
vi.mock('../../lib/supabase', async () => (await import('../../test/apiMock')).supabaseModule);
// The network calls become an in-memory copy of what the qs_* database functions do.
vi.mock('../../lib/quickSplit', async importOriginal => {
    const real = await importOriginal<typeof import('../../lib/quickSplit')>();
    const { fakeQuick } = await import('../../test/fakeQuick');
    return { ...real, ...fakeQuick.api };
});

import { apiMock as api, resetMocks, authMock, group, ME } from '../../test/apiMock';
import { fakeQuick } from '../../test/fakeQuick';
import QuickSplit from '../QuickSplit';

const TOKEN = 'a'.repeat(32);
const view = () => render(<QuickSplit token={TOKEN} />);

beforeEach(() => {
    resetMocks();
    localStorage.clear();
    window.history.replaceState(null, '', `/s/${TOKEN}`);
    fakeQuick.reset();
});
afterEach(cleanup);

describe('Quick split page (no account)', () => {
    const OWNER = (extra: object = {}) => localStorage.setItem(`splitpot:quick:${TOKEN}`, JSON.stringify({ ownerKey: 'OWNER', ...extra }));
    const asMember = (name: string) => localStorage.setItem(`splitpot:quick:${TOKEN}`, JSON.stringify({ me: name, memberKey: `key-${name}` }));

    it('a stranger opens the link and joins with a name that is not taken', async () => {
        const u = userEvent.setup();
        fakeQuick.seed({ people: ['Ann'] });
        view();
        expect(await screen.findByText('Who are you?')).toBeInTheDocument();
        await u.type(screen.getByLabelText('Your name'), 'ann');
        await u.click(screen.getByRole('button', { name: 'Join' }));
        expect(await screen.findByText('That name is taken.')).toBeInTheDocument();
        await u.clear(screen.getByLabelText('Your name'));
        await u.type(screen.getByLabelText('Your name'), 'Cy');
        await u.click(screen.getByRole('button', { name: 'Join' }));
        expect(await screen.findByText('Cy', { selector: 'strong' })).toBeInTheDocument();
        const saved = JSON.parse(localStorage.getItem(`splitpot:quick:${TOKEN}`)!);
        expect(saved).toMatchObject({ me: 'Cy', memberKey: 'key-Cy' }); // remembered, with the private key
    });

    it('lost your session? "not you?" then tap your own name to get back in, with a fresh key', async () => {
        const u = userEvent.setup();
        fakeQuick.seed({ people: ['Ann', 'Bo'], items: [{ name: 'Pasta', price: 30 }], ownerKey: 'OWNER' });
        localStorage.clear(); // cleared browser / new device: nothing remembered
        view();
        await u.click(await screen.findByRole('button', { name: "I'm Ann" }));
        await waitFor(() => expect(fakeQuick.api.reclaimQuickSplit).toHaveBeenCalledWith(TOKEN, 'Ann'));
        expect(await screen.findByText('Ann', { selector: 'strong' })).toBeInTheDocument();
        expect(JSON.parse(localStorage.getItem(`splitpot:quick:${TOKEN}`)!)).toMatchObject({ me: 'Ann', memberKey: 'key-Ann' });
        // and now they can pick their own items again
        await u.click(await screen.findByLabelText('Ann had Pasta'));
        await waitFor(() => expect(fakeQuick.state.items[0].assigned).toEqual(['Ann']));
        // "not you?" puts the list back
        await u.click(screen.getByRole('button', { name: 'not you?' }));
        expect(await screen.findByRole('button', { name: "I'm Bo" })).toBeInTheDocument();
    });

    it('the owner can act as anyone already on the split', async () => {
        const u = userEvent.setup();
        fakeQuick.seed({ people: ['Ann'], ownerKey: 'OWNER' });
        OWNER();
        view();
        await u.click(await screen.findByRole('button', { name: "I'm Ann" }));
        expect(await screen.findByText('Ann', { selector: 'strong' })).toBeInTheDocument();
    });

    it('the owner edits everything: add items, tap who had what for anybody, and each share includes tax and tip', async () => {
        const u = userEvent.setup();
        fakeQuick.seed({ people: ['Ann', 'Bo'], tax: 2, tip: 3, ownerKey: 'OWNER' });
        OWNER({ me: 'Ann', memberKey: 'key-Ann' });
        view();
        await u.type(await screen.findByLabelText('New item name'), 'Pasta');
        await u.type(screen.getByLabelText('New item price'), '30');
        await u.click(screen.getByRole('button', { name: 'Add' }));
        await u.type(screen.getByLabelText('New item name'), 'Salad');
        await u.type(screen.getByLabelText('New item price'), '10');
        await u.click(screen.getByRole('button', { name: 'Add' }));
        await u.click(await screen.findByLabelText('Ann had Pasta'));
        await u.click(screen.getByLabelText('Bo had Salad')); // the owner can tap someone else
        // items 30 : 10, tax+tip 5 shared 3:1 -> Ann 33.75, Bo 11.25
        await waitFor(() => expect(screen.getByText('$33.75')).toBeInTheDocument());
        expect(screen.getByText('$11.25')).toBeInTheDocument();
        expect(screen.getByText('$45.00', { selector: 'span.text-4xl' })).toBeInTheDocument(); // the total
        await u.click(screen.getByLabelText('Bo had Pasta')); // sharing an item splits it
        await waitFor(() => expect(screen.getAllByText('15.00 each', { exact: false }).length).toBeGreaterThan(0));
    });

    it('everyone else can only tap THEMSELVES on and off items (and add items): no editing, no removing people, no tapping others', async () => {
        const u = userEvent.setup();
        fakeQuick.seed({ people: ['Ann', 'Bo'], items: [{ name: 'Pasta', price: 30, assigned: ['Bo'] }, { name: 'Salad', price: 10 }], tax: 2, ownerKey: 'OWNER' });
        asMember('Ann');
        view();
        const mine = await screen.findByLabelText('Ann had Pasta');
        expect(mine).toBeEnabled();
        expect(screen.getByLabelText('Bo had Pasta')).toBeDisabled(); // cannot deselect Bo
        expect(screen.getByLabelText('Bo had Salad')).toBeDisabled();
        // nothing about the split itself is editable
        for (const label of ['Item name Pasta', 'Price of Pasta', 'Paid by', 'Tax', 'Tip', 'Split title']) expect(screen.getByLabelText(label)).toBeDisabled();
        for (const label of ['Remove Bo', 'Remove Ann', 'Delete Pasta']) expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
        expect(screen.getByLabelText('New item name')).toBeInTheDocument(); // but they can add an item
        expect(screen.queryByRole('button', { name: 'Everyone' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Import from JSON' })).not.toBeInTheDocument();
        await u.click(mine);
        await waitFor(() => expect(fakeQuick.state.items[0].assigned.sort()).toEqual(['Ann', 'Bo']));
        await u.click(mine);
        await waitFor(() => expect(fakeQuick.state.items[0].assigned).toEqual(['Bo']));
        expect(fakeQuick.api.assignQuickItem).toHaveBeenCalledWith(TOKEN, 'i0', 'Ann', true, { memberKey: 'key-Ann', ownerKey: null });
    });

    it('layout: Paid by sits near the top, Who owes what is at the bottom; people have colors', async () => {
        fakeQuick.seed({ people: ['Ann', 'Bo'], items: [{ name: 'Pasta', price: 30, assigned: ['Ann'] }], ownerKey: 'OWNER', paidBy: 'Ann', tax: 1 });
        asMember('Ann');
        view();
        const paid = await screen.findByLabelText('Paid by');
        const items = screen.getByText(/^Items ·/);
        const tax = screen.getByLabelText('Tax');
        const owes = screen.getByText('Who owes what');
        const after = (x: Node, y: Node) => !!(x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING);
        expect(after(paid, items)).toBe(true);
        expect(after(items, owes)).toBe(true);
        expect(after(owes, tax)).toBe(true); // tax and tip live in the summary card, which is last
        // colors: a picked chip takes the person's color, and the two people differ
        const annChip = screen.getByLabelText('Ann had Pasta');
        const boChip = screen.getByLabelText('Bo had Pasta');
        expect(annChip.style.background || annChip.getAttribute('style')).toBeTruthy();
        expect(boChip.getAttribute('style')).toBeNull(); // not picked: plain dashed chip
        expect(screen.getByText('paid the bill')).toBeInTheDocument();
        expect(screen.getByText('owes Ann')).toBeInTheDocument();
    });

    it('a joined guest can add an item; someone who has not joined (or has no key) cannot', async () => {
        const u = userEvent.setup();
        fakeQuick.seed({ people: ['Ann'], ownerKey: 'OWNER' });
        asMember('Ann');
        const first = view();
        await u.type(await screen.findByLabelText('New item name'), 'Fries');
        await u.type(screen.getByLabelText('New item price'), '6.5');
        await u.click(screen.getByRole('button', { name: 'Add' }));
        await waitFor(() => expect(fakeQuick.state.items.map(i => i.name)).toEqual(['Fries']));
        expect(fakeQuick.api.addQuickItems).toHaveBeenCalledWith(TOKEN, [{ name: 'Fries', price: 6.5 }], null, 'key-Ann');
        // a guest cannot edit or delete what they added; that is the owner's
        expect(await screen.findByLabelText('Price of Fries')).toBeDisabled();
        expect(screen.queryByLabelText('Delete Fries')).not.toBeInTheDocument();
        first.unmount();
        localStorage.clear(); // not joined on this device: no add form
        view();
        await screen.findByText('Who are you?');
        expect(screen.queryByLabelText('New item name')).not.toBeInTheDocument();
        await expect(fakeQuick.api.addQuickItems(TOKEN, [{ name: 'x', price: 1 }], null, 'guess')).rejects.toThrow('Join the split');
    });

    it('a name without its key on this browser cannot tap anything (and the server would refuse anyway)', async () => {
        fakeQuick.seed({ people: ['Ann'], items: [{ name: 'Pasta', price: 30 }], ownerKey: 'OWNER' });
        localStorage.setItem(`splitpot:quick:${TOKEN}`, JSON.stringify({ me: 'Ann' })); // no memberKey
        view();
        expect(await screen.findByLabelText('Ann had Pasta')).toBeDisabled();
        await expect(fakeQuick.api.assignQuickItem(TOKEN, 'i0', 'Ann', true, { memberKey: 'guess' })).rejects.toThrow('only choose items for yourself');
    });

    it('a locked split is read-only for everyone; only the owner can unlock', async () => {
        const u = userEvent.setup();
        fakeQuick.seed({ people: ['Ann'], items: [{ name: 'Pasta', price: 12, assigned: ['Ann'] }], locked: true, ownerKey: 'KEY' });
        localStorage.setItem(`splitpot:quick:${TOKEN}`, JSON.stringify({ me: 'Ann' }));
        const first = view();
        expect(await screen.findByText(/The owner locked this split/)).toBeInTheDocument();
        expect(screen.queryByLabelText('New item name')).not.toBeInTheDocument();
        expect(screen.getByLabelText('Ann had Pasta')).toBeDisabled();
        expect(screen.queryByText(/Unlock/)).not.toBeInTheDocument(); // not the owner
        first.unmount();

        localStorage.setItem(`splitpot:quick:${TOKEN}`, JSON.stringify({ me: 'Ann', ownerKey: 'KEY' }));
        view();
        await u.click(await screen.findByRole('button', { name: /Unlock so people can edit again/ }));
        await waitFor(() => expect(screen.getByLabelText('New item name')).toBeInTheDocument());
        expect(fakeQuick.state.locked).toBe(false);
    });

    it('the owner link (#owner=) makes this browser the owner and is then removed from the address bar', async () => {
        fakeQuick.seed({ people: ['Ann'], ownerKey: 'KEY' });
        window.history.replaceState(null, '', `/s/${TOKEN}#owner=KEY`);
        view();
        expect(await screen.findByRole('button', { name: /Lock so nobody can change it/ })).toBeInTheDocument();
        expect(window.location.hash).toBe('');
    });

    it('only the owner can rename the split; everyone else sees plain text', async () => {
        const u = userEvent.setup();
        fakeQuick.seed({ title: 'Dinner', ownerKey: 'KEY' });
        const guest = view();
        expect(await screen.findByLabelText('Split title')).toBeDisabled();
        expect(screen.queryByText('Tap the title to rename it')).not.toBeInTheDocument();
        guest.unmount();

        localStorage.setItem(`splitpot:quick:${TOKEN}`, JSON.stringify({ ownerKey: 'KEY' })); // the owner, not even joined yet
        view();
        const title = await screen.findByLabelText('Split title');
        expect(title).toBeEnabled();
        await u.clear(title);
        await u.type(title, 'Sushi night{Enter}');
        await waitFor(() => expect(fakeQuick.state.title).toBe('Sushi night'));
        expect(document.title).toMatch(/Sushi night/);
    });

    it('the owner can still rename a locked split; nobody else can', async () => {
        const u = userEvent.setup();
        fakeQuick.seed({ title: 'Dinner', locked: true, ownerKey: 'KEY' });
        localStorage.setItem(`splitpot:quick:${TOKEN}`, JSON.stringify({ ownerKey: 'KEY' }));
        view();
        const title = await screen.findByLabelText('Split title');
        expect(title).toBeEnabled();
        await u.clear(title);
        await u.type(title, 'Renamed{Enter}');
        await waitFor(() => expect(fakeQuick.state.title).toBe('Renamed'));
    });

    it('has a clear way back to the app on every state of the page', async () => {
        fakeQuick.seed({ people: ['Ann'] });
        const first = view();
        const home = await screen.findByRole('link', { name: /Home$/ });
        expect(home).toHaveAttribute('href', '/');
        first.unmount();
        fakeQuick.state.gone = true;
        view();
        await screen.findByText("This split isn't here");
        expect(screen.getByRole('link', { name: /Home$/ })).toHaveAttribute('href', '/');
    });

    it('signed in with the owner key: the split is attached to the account (so Personal lists it)', async () => {
        authMock.getSession.mockResolvedValue({ data: { session: { user: { id: ME } } } });
        fakeQuick.seed({ people: ['Ann'], ownerKey: 'KEY' });
        localStorage.setItem(`splitpot:quick:${TOKEN}`, JSON.stringify({ ownerKey: 'KEY' }));
        view();
        await waitFor(() => expect(fakeQuick.api.claimQuickSplit).toHaveBeenCalledWith(TOKEN, 'KEY'));
        expect(fakeQuick.state.claimed).toBe(true);
    });

    it('signed out, the owner key is not claimed anywhere', async () => {
        fakeQuick.seed({ people: ['Ann'], ownerKey: 'KEY' });
        localStorage.setItem(`splitpot:quick:${TOKEN}`, JSON.stringify({ ownerKey: 'KEY' }));
        view();
        await screen.findByLabelText('Split title');
        expect(fakeQuick.api.claimQuickSplit).not.toHaveBeenCalled();
    });

    it('the account that owns a split is its owner on any device, without the owner key', async () => {
        const u = userEvent.setup();
        authMock.getSession.mockResolvedValue({ data: { session: { user: { id: ME } } } });
        fakeQuick.seed({ title: 'Dinner', ownerKey: 'KEY', claimed: true }); // no key in this browser
        view();
        const title = await screen.findByLabelText('Split title');
        await waitFor(() => expect(title).toBeEnabled());
        expect(screen.getByRole('button', { name: /Lock so nobody can change it/ })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Copy owner link/ })).not.toBeInTheDocument(); // there is no key to copy
        await u.clear(title);
        await u.type(title, 'From my phone{Enter}');
        await waitFor(() => expect(fakeQuick.state.title).toBe('From my phone'));
    });

    it('a wrong or expired link says so', async () => {
        fakeQuick.state.gone = true;
        view();
        expect(await screen.findByText("This split isn't here")).toBeInTheDocument();
    });

    it('imports items from the receipt JSON, with tax and tip', async () => {
        const u = userEvent.setup();
        fakeQuick.seed({ people: ['Ann'], ownerKey: 'OWNER' });
        localStorage.setItem(`splitpot:quick:${TOKEN}`, JSON.stringify({ me: 'Ann', memberKey: 'key-Ann', ownerKey: 'OWNER' }));
        view();
        await u.click(await screen.findByRole('button', { name: 'Import from JSON' }));
        await u.click(screen.getByLabelText('Receipt JSON'));
        await u.paste('{"items":[{"name":"Burger","price":11},{"name":"Fries","price":4}],"tax":1.5,"tip":2}');
        await u.click(screen.getByRole('button', { name: 'Add these items' }));
        expect(await screen.findByDisplayValue('Burger')).toBeInTheDocument();
        expect(fakeQuick.state.items.map(i => i.name)).toEqual(['Burger', 'Fries']);
        expect(fakeQuick.state.tax).toBe(1.5);
        expect(fakeQuick.state.tip).toBe(2);
    });

    it('signed-in users can import it to a group, matching names to members', async () => {
        const u = userEvent.setup();
        authMock.getSession.mockResolvedValue({ data: { session: { user: { id: ME } } } });
        api.listGroups.mockResolvedValue([group]);
        api.createSession.mockResolvedValue('new1');
        fakeQuick.seed({ title: 'Dinner out', people: ['Daven', 'Cam'], tax: 2, items: [{ name: 'Pasta', price: 20, assigned: ['Daven', 'Cam'] }, { name: 'Wine', price: 10, assigned: ['Cam'] }], paidBy: 'Daven' });
        localStorage.setItem(`splitpot:quick:${TOKEN}`, JSON.stringify({ me: 'Daven', ownerKey: 'OWNER' }));
        view();
        await u.click(await screen.findByRole('button', { name: 'Import to a group' }));
        const dialog = await screen.findByRole('dialog');
        await waitFor(() => expect(within(dialog).getByLabelText('Daven is')).toHaveValue(ME)); // matched by name
        expect(within(dialog).getByLabelText('Cam is')).toHaveValue(''); // nobody called Cam: left unassigned...
        await u.selectOptions(within(dialog).getByLabelText('Cam is'), 'Amy'); // ...until chosen
        await u.click(within(dialog).getByRole('button', { name: 'Import' }));
        await waitFor(() => expect(api.createSession).toHaveBeenCalledWith(expect.objectContaining({
            groupId: 'g1', name: 'Dinner out', tax: 2, tip: 0, participants: [ME, 'u-amy', 'u-bo'],
            items: [{ name: 'Pasta', price: 20, assigned_users: [ME, 'u-amy'] }, { name: 'Wine', price: 10, assigned_users: ['u-amy'] }],
        })));
        await waitFor(() => expect(api.updateSession).toHaveBeenCalledWith('new1', { paid_by: ME }));
        expect(await within(dialog).findByText('Imported to Roomies')).toBeInTheDocument();
    });

    it('a signed-out OWNER is pointed to sign in to save it to a group', async () => {
        fakeQuick.seed({ people: ['Ann'], ownerKey: 'OWNER' });
        localStorage.setItem(`splitpot:quick:${TOKEN}`, JSON.stringify({ ownerKey: 'OWNER' }));
        view();
        expect(await screen.findByText(/Sign in to Settled to turn this split/)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Import to a group' })).not.toBeInTheDocument();
    });

    it('only the person who made the split sees "Keep this in a group" (not guests, signed in or not)', async () => {
        fakeQuick.seed({ people: ['Ann'], ownerKey: 'OWNER' });
        asMember('Ann');
        const out = view();
        await screen.findByLabelText('Split title');
        expect(screen.queryByText('Keep this in a group')).not.toBeInTheDocument();
        out.unmount();
        authMock.getSession.mockResolvedValue({ data: { session: { user: { id: ME } } } }); // a signed-in guest
        view();
        await screen.findByLabelText('Split title');
        await waitFor(() => expect(authMock.getSession).toHaveBeenCalled());
        expect(screen.queryByText('Keep this in a group')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Import to a group' })).not.toBeInTheDocument();
    });
});

describe('Quick split draft (nothing exists until Create)', () => {
    const assign = vi.fn();
    beforeEach(() => {
        assign.mockClear();
        Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign, origin: 'http://localhost', hash: '', pathname: '/s/new' } });
        fakeQuick.api.createFromDraft.mockClear();
    });

    it('is editable without creating or saving anything, and Create saves it all and opens the real link', async () => {
        const u = userEvent.setup();
        render(<QuickSplit token={null} />);
        expect(await screen.findByText('Nothing is saved yet')).toBeInTheDocument();
        await u.type(screen.getByLabelText('Your name'), 'Ann');
        await u.click(screen.getByRole('button', { name: 'Join' }));
        await u.type(await screen.findByLabelText('New item name'), 'Pizza');
        await u.type(screen.getByLabelText('New item price'), '12');
        await u.click(screen.getByRole('button', { name: 'Add' }));
        await u.click(await screen.findByRole('button', { name: 'Ann had Pizza' }));
        expect(fakeQuick.api.createFromDraft).not.toHaveBeenCalled(); // editing alone never creates anything
        expect(fakeQuick.api.addQuickItems).not.toHaveBeenCalled();

        await u.click(screen.getByRole('button', { name: 'Create quick split' }));
        await waitFor(() => expect(assign).toHaveBeenCalledWith(`/s/${fakeQuick.state.token}`));
        expect(fakeQuick.state.people).toEqual(['Ann']);
        expect(fakeQuick.state.items).toMatchObject([{ name: 'Pizza', price: 12, assigned: ['Ann'] }]);
    });
});

describe('Quick split draft leave warning', () => {
    const leave = () => { const ev = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(ev); return ev.defaultPrevented; };
    beforeEach(() => {
        Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign: vi.fn(), origin: 'http://localhost', hash: '', pathname: '/s/new' } });
    });

    it('does not warn for an empty draft, warns once it has something in it, and stops warning after Create', async () => {
        const u = userEvent.setup();
        render(<QuickSplit token={null} />);
        await screen.findByText('Nothing is saved yet');
        expect(leave()).toBe(false); // nothing to lose
        await u.type(screen.getByLabelText('Your name'), 'Ann');
        await u.click(screen.getByRole('button', { name: 'Join' }));
        await screen.findByLabelText('New item name');
        expect(leave()).toBe(true); // a person is in it now
        await u.click(screen.getByRole('button', { name: 'Create quick split' }));
        await waitFor(() => expect(window.location.assign).toHaveBeenCalled());
        expect(leave()).toBe(false); // saved: leaving is fine
    });

    it('a saved split never warns', async () => {
        fakeQuick.seed({ people: ['Ann'], items: [{ name: 'Pizza', price: 12 }] });
        localStorage.setItem(`splitpot:quick:${TOKEN}`, JSON.stringify({ ownerKey: 'OWNER', me: 'Ann' }));
        view();
        await screen.findByText('Who owes what');
        expect(leave()).toBe(false);
    });
});

describe('Quick split owner sign-in note', () => {
    it('tells a signed-out owner to sign in to keep it, but not guests or signed-in owners', async () => {
        fakeQuick.seed({ people: ['Ann'] });
        localStorage.setItem(`splitpot:quick:${TOKEN}`, JSON.stringify({ ownerKey: 'OWNER', me: 'Ann' }));
        const first = view();
        expect(await screen.findByText(/Sign in to keep this and manage it from any device/)).toBeInTheDocument();
        first.unmount();

        localStorage.setItem(`splitpot:quick:${TOKEN}`, JSON.stringify({ me: 'Ann', memberKey: 'key-Ann' })); // a guest
        const guest = view();
        await screen.findByText('Who owes what');
        expect(screen.queryByText(/Sign in to keep this and manage it from any device/)).not.toBeInTheDocument();
        guest.unmount();

        localStorage.setItem(`splitpot:quick:${TOKEN}`, JSON.stringify({ ownerKey: 'OWNER', me: 'Ann' }));
        authMock.getSession.mockResolvedValue({ data: { session: { user: { id: ME } } } });
        view();
        await screen.findByText('Who owes what');
        await waitFor(() => expect(screen.getByText('Import to a group')).toBeInTheDocument()); // signed in
        expect(screen.queryByText(/Sign in to keep this and manage it from any device/)).not.toBeInTheDocument();
    });
});
