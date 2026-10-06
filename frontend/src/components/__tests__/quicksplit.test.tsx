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
    it('a stranger opens the link, adds their name, and names are unique', async () => {
        const u = userEvent.setup();
        fakeQuick.seed({ people: ['Ann'] });
        view();
        expect(await screen.findByText('Who are you?')).toBeInTheDocument();
        await u.type(screen.getByLabelText('Your name'), 'ann');
        await u.click(screen.getByRole('button', { name: 'Join' }));
        expect(await screen.findByText('That name is taken.')).toBeInTheDocument();
        await u.click(screen.getByRole('button', { name: "I'm Ann" })); // the same person coming back
        expect(await screen.findByText('Ann', { selector: 'strong' })).toBeInTheDocument();
        expect(JSON.parse(localStorage.getItem(`splitpot:quick:${TOKEN}`)!).me).toBe('Ann'); // remembered next visit
    });

    it('everyone edits: add items, tap who had what, and each share includes tax and tip', async () => {
        const u = userEvent.setup();
        fakeQuick.seed({ people: ['Ann', 'Bo'], tax: 2, tip: 3 });
        localStorage.setItem(`splitpot:quick:${TOKEN}`, JSON.stringify({ me: 'Ann' }));
        view();
        await u.type(await screen.findByLabelText('New item name'), 'Pasta');
        await u.type(screen.getByLabelText('New item price'), '30');
        await u.click(screen.getByRole('button', { name: 'Add' }));
        await u.type(screen.getByLabelText('New item name'), 'Salad');
        await u.type(screen.getByLabelText('New item price'), '10');
        await u.click(screen.getByRole('button', { name: 'Add' }));
        await u.click(await screen.findByLabelText('Ann had Pasta'));
        await u.click(screen.getByLabelText('Bo had Salad'));
        // items 30 : 10, tax+tip 5 shared 3:1 -> Ann 33.75, Bo 11.25
        await waitFor(() => expect(screen.getByText('$33.75')).toBeInTheDocument());
        expect(screen.getByText('$11.25')).toBeInTheDocument();
        expect(screen.getByText('$45.00', { selector: 'span.text-\\[34px\\]' })).toBeInTheDocument(); // the total
        await u.click(screen.getByLabelText('Bo had Pasta')); // sharing an item splits it
        await waitFor(() => expect(screen.getAllByText('15.00 each', { exact: false }).length).toBeGreaterThan(0));
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
        fakeQuick.seed({ people: ['Ann'] });
        localStorage.setItem(`splitpot:quick:${TOKEN}`, JSON.stringify({ me: 'Ann' }));
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
        localStorage.setItem(`splitpot:quick:${TOKEN}`, JSON.stringify({ me: 'Daven' }));
        view();
        await u.click(await screen.findByRole('button', { name: 'Import to a group' }));
        const dialog = await screen.findByRole('dialog');
        await waitFor(() => expect(within(dialog).getByLabelText('Daven is')).toHaveValue(ME)); // matched by name
        expect(within(dialog).getByLabelText('Cam is')).toHaveValue(''); // nobody called Cam: left unassigned...
        await u.selectOptions(within(dialog).getByLabelText('Cam is'), 'Amy'); // ...until chosen
        await u.click(within(dialog).getByRole('button', { name: 'Import' }));
        await waitFor(() => expect(api.createSession).toHaveBeenCalledWith(expect.objectContaining({
            groupId: 'g1', name: 'Dinner out', tax: 2, tip: 0, participants: ['Daven', 'Amy', 'Bo'],
            items: [{ name: 'Pasta', price: 20, assigned_users: ['Daven', 'Amy'] }, { name: 'Wine', price: 10, assigned_users: ['Amy'] }],
        })));
        await waitFor(() => expect(api.updateSession).toHaveBeenCalledWith('new1', { paid_by: ME }));
        expect(await within(dialog).findByText('Imported to Roomies')).toBeInTheDocument();
    });

    it('a signed-out visitor is pointed to sign in instead', async () => {
        fakeQuick.seed({ people: ['Ann'] });
        view();
        expect(await screen.findByText(/Sign in to Splitpot to turn this split/)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Import to a group' })).not.toBeInTheDocument();
    });
});
