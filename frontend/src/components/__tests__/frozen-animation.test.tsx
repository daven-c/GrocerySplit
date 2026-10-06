// @vitest-environment jsdom
// Regression: browsers pause requestAnimationFrame in hidden/occluded/throttled tabs. Framer then never
// finishes an animation, which used to leave pages at opacity 0 (elements present, but all white) and
// block navigation. Frames are frozen BEFORE framer loads, as in a real tab.
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.hoisted(() => {
    (globalThis as any).requestAnimationFrame = () => 0;
    (globalThis as any).cancelAnimationFrame = () => {};
});

import { render, screen, cleanup, fireEvent, within, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('../../lib/api', async () => (await import('../../test/apiMock')).apiMock);
vi.mock('../../lib/supabase', async () => (await import('../../test/apiMock')).supabaseModule);

import { authMock, resetMocks, signedInSession } from '../../test/apiMock';
import { effectiveOpacity } from '../../test/render';
import App from '../../App';

const MIN = 0.45; // anything dimmer than this would read as "all white"

beforeEach(() => {
    resetMocks();
    authMock.getSession.mockResolvedValue({ data: { session: signedInSession } });
});
afterEach(cleanup);

describe('with animation frames frozen', () => {
    it('the landing page is visible when signed out', async () => {
        authMock.getSession.mockResolvedValue({ data: { session: null } });
        render(<App />);
        const h1 = await screen.findByRole('heading', { level: 1, name: /Split any cost/ });
        expect(effectiveOpacity(h1)).toBeGreaterThanOrEqual(MIN);
        expect(effectiveOpacity(screen.getByText('Exact, every time'))).toBeGreaterThanOrEqual(MIN);
    });

    it('home content is visible, not stuck at opacity 0', async () => {
        render(<App />);
        const row = await screen.findByText('3 people · 3 expenses · $2,500.10 total');
        expect(effectiveOpacity(row)).toBeGreaterThanOrEqual(MIN);
        expect(effectiveOpacity(await screen.findByText(/^(Morning|Afternoon|Evening), Daven$/))).toBeGreaterThanOrEqual(MIN);
    });

    it('every screen still mounts and stays visible: group, receipt, expense, friends, account', async () => {
        render(<App />);
        const sidebar = await screen.findByRole('complementary', { name: 'Sidebar' });

        fireEvent.click(await within(sidebar).findByRole('button', { name: 'Roomies' }));
        const costco = await screen.findByText('Costco'); // group detail mounted despite no frames
        expect(effectiveOpacity(costco)).toBeGreaterThanOrEqual(MIN);

        fireEvent.click(costco);
        const oat = await screen.findByText('Oat Milk'); // receipt editor
        expect(effectiveOpacity(oat)).toBeGreaterThanOrEqual(MIN);
        expect(effectiveOpacity(screen.getByText('Who pays what'))).toBeGreaterThanOrEqual(MIN);

        fireEvent.click(within(screen.getByRole('main')).getByRole('button', { name: /Roomies/ }));
        fireEvent.click(await screen.findByText('October rent'));
        const amount = await screen.findByLabelText('How much was it?'); // expense editor
        expect(effectiveOpacity(amount)).toBeGreaterThanOrEqual(MIN);
        expect(effectiveOpacity(screen.getByText('Split by'))).toBeGreaterThanOrEqual(MIN);

        fireEvent.click(within(sidebar).getByRole('button', { name: 'People' }));
        const amy = await screen.findByText('Amy');
        expect(effectiveOpacity(amy)).toBeGreaterThanOrEqual(MIN);

        fireEvent.click(within(sidebar).getByRole('button', { name: 'Account' }));
        expect(effectiveOpacity(await screen.findByLabelText('Display name'))).toBeGreaterThanOrEqual(MIN);
    });

    it('tabs, menus and dialogs are visible and dismissable without frames', async () => {
        render(<App />);
        const sidebar = await screen.findByRole('complementary', { name: 'Sidebar' });
        fireEvent.click(await within(sidebar).findByRole('button', { name: 'Roomies' }));
        fireEvent.click(await screen.findByRole('button', { name: /Add expense/ }));
        const menu = await screen.findByRole('menu');
        expect(effectiveOpacity(menu)).toBeGreaterThanOrEqual(MIN);
        fireEvent.keyDown(document, { key: 'Escape' });

        fireEvent.click(screen.getByRole('tab', { name: /Members/ }));
        fireEvent.click(await screen.findByRole('button', { name: 'Delete group' }));
        const dialog = await screen.findByRole('dialog');
        expect(effectiveOpacity(dialog)).toBeGreaterThanOrEqual(MIN);
        fireEvent.keyDown(document, { key: 'Escape' });
        // The exit needs frames to finish; the underlying page must still be interactive afterwards.
        fireEvent.click(screen.getByRole('tab', { name: /Expenses/ }));
        expect(await screen.findByText('Costco')).toBeInTheDocument();
    });

    it('while the tab is hidden, animations are skipped so content is fully opaque', async () => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
        try {
            render(<App />);
            const row = await screen.findByText('3 people · 3 expenses · $2,500.10 total');
            await waitFor(() => expect(effectiveOpacity(row)).toBe(1));
        } finally {
            Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
            document.dispatchEvent(new Event('visibilitychange'));
        }
    });
});
