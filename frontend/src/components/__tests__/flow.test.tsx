// @vitest-environment jsdom
// The whole app, driven like a person would, against the in-memory backend that `npm run dev:mock` uses.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

vi.mock('../../lib/api', () => import('../../mocks/api'));
vi.mock('../../lib/supabase', () => import('../../mocks/supabase'));

import App from '../../App';

beforeEach(() => {
    window.scrollTo = vi.fn() as any;
    (window as any).matchMedia = (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
});
afterEach(cleanup);

const SLOW = { timeout: 4000 };

describe('signed in: from Home to a saved expense', () => {
    it('opens a group, adds an expense split with everyone, saves it, and sees it in the list and the total', async () => {
        const u = userEvent.setup();
        render(<App />);

        // Home, with the group list
        await screen.findByText(/Overall you're/, undefined, SLOW);
        await u.click(await screen.findByRole('button', { name: /^Roomies/ }));
        expect(await screen.findByRole('heading', { name: 'Roomies' }, SLOW)).toBeInTheDocument();
        expect(screen.getByText('$2,445.10')).toBeInTheDocument();

        // Add an expense: it opens as a draft, nothing is in the list yet
        await u.click(screen.getByRole('button', { name: /Add expense/ }));
        await u.click(await screen.findByRole('menuitem', { name: /Add an expense/ }));
        const name = await screen.findByLabelText('Expense name', undefined, SLOW);
        await u.clear(name);
        await u.type(name, 'Pizza night');
        await u.type(screen.getByLabelText('How much was it?'), '90');
        await u.click(screen.getByRole('button', { name: 'Select everyone' }));
        expect(await screen.findByText('Adds up to $90.00')).toBeInTheDocument();
        expect(screen.getByLabelText('Daven amount')).toHaveValue('30');

        // Save publishes it and returns to the group
        await u.click(screen.getByRole('button', { name: 'Save expense' }));
        expect(await screen.findByRole('heading', { name: 'Roomies' }, SLOW)).toBeInTheDocument();
        const row = await screen.findByRole('button', { name: /Pizza night/ }, SLOW);
        expect(within(row).getByText('$90.00')).toBeInTheDocument();
        await waitFor(() => expect(screen.getByText('$2,535.10')).toBeInTheDocument(), SLOW); // the group's total cost grew by $90
    });

    it('a draft that is discarded never reaches the list', async () => {
        const u = userEvent.setup();
        render(<App />);
        await u.click(await screen.findByRole('button', { name: /^Roomies/ }, SLOW));
        await screen.findByRole('heading', { name: 'Roomies' }, SLOW);
        await u.click(screen.getByRole('button', { name: /Add expense/ }));
        await u.click(await screen.findByRole('menuitem', { name: /Add an expense/ }));
        const name = await screen.findByLabelText('Expense name', undefined, SLOW);
        await u.clear(name);
        await u.type(name, 'Never saved');
        await u.click(screen.getByRole('button', { name: 'Discard' }));
        expect(await screen.findByRole('heading', { name: 'Roomies' }, SLOW)).toBeInTheDocument();
        await waitFor(() => expect(screen.queryByText('Never saved')).not.toBeInTheDocument());
    });
});
