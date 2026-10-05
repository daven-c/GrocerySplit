// @vitest-environment jsdom
// Regression: browsers pause requestAnimationFrame in hidden/occluded/throttled tabs. Framer then never
// finishes an animation, which used to leave pages at opacity 0 (elements present, but all white) and
// block navigation (AnimatePresence mode="wait"). Frames are frozen BEFORE framer loads, as in a real tab.
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.hoisted(() => {
    (globalThis as any).requestAnimationFrame = () => 0;
    (globalThis as any).cancelAnimationFrame = () => {};
});

import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const ME = 'u-me';
const members = [
    { user_id: ME, name: 'Me', email: 'me@x.com', role: 'owner' as const },
    { user_id: 'u-amy', name: 'Amy', email: 'amy@x.com', role: 'member' as const },
];
const group = { id: 'g1', name: 'Roomies', owner_id: ME, created_at: '2026-01-01', members };
const session = {
    id: 's1', group_id: 'g1', user_id: ME, paid_by: ME, name: 'Corner Market', session_date: '2026-10-05', tax: 0, tip: 0,
    participants: ['Me', 'Amy'], updated_at: '2026-10-05T10:00:00Z',
    items: [{ id: 'i1', name: 'Oat Milk', price: 8, assigned_users: ['Me', 'Amy'] }],
};

const api = vi.hoisted(() => ({
    listGroups: vi.fn(), listSessions: vi.fn(), listSettlements: vi.fn(), myInvites: vi.fn(), isAdmin: vi.fn(),
    getGroup: vi.fn(), getSession: vi.fn(), listPendingInvites: vi.fn(),
}));
vi.mock('../../lib/api', () => api);
vi.mock('../../lib/supabase', () => ({
    supabase: {
        auth: {
            getSession: async () => ({ data: { session: { user: { id: ME, email: 'me@x.com', user_metadata: { name: 'Me' } } } } }),
            getUser: async () => ({ data: { user: { id: ME } } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        },
    },
}));

import App from '../../App';

/** What the user actually sees: opacity multiplied up the ancestor chain. */
const effectiveOpacity = (el: Element) => {
    let o = 1;
    for (let e: Element | null = el; e; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity || '1');
    return o;
};

beforeEach(() => {
    window.scrollTo = vi.fn() as any;
    (window as any).matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    api.listGroups.mockResolvedValue([group]);
    api.listSessions.mockResolvedValue([session]);
    api.listSettlements.mockResolvedValue([]);
    api.myInvites.mockResolvedValue([]);
    api.isAdmin.mockResolvedValue(false);
    api.getGroup.mockResolvedValue(group);
    api.getSession.mockResolvedValue(session);
    api.listPendingInvites.mockResolvedValue([]);
});
afterEach(cleanup);

describe('with animation frames frozen', () => {
    it('landing page content is visible, not stuck at opacity 0', async () => {
        render(<App />);
        const card = await screen.findByText('Roomies');
        expect(effectiveOpacity(card)).toBeGreaterThanOrEqual(0.45);
        expect(effectiveOpacity(screen.getByText(/Welcome back/))).toBeGreaterThanOrEqual(0.45);
    });

    it('tab switches and screen navigation still happen, and the new content is visible', async () => {
        render(<App />);
        await screen.findByText('Roomies');

        fireEvent.click(screen.getByRole('tab', { name: 'Friends' }));
        const amy = await screen.findByText('Amy');
        expect(screen.queryByText('Roomies')).not.toBeInTheDocument();
        expect(effectiveOpacity(amy)).toBeGreaterThanOrEqual(0.45);

        fireEvent.click(screen.getByRole('tab', { name: 'Groups' }));
        fireEvent.click(await screen.findByText('Roomies'));

        const receipt = await screen.findByText('Corner Market'); // GroupDetail mounted despite no frames
        expect(effectiveOpacity(receipt)).toBeGreaterThanOrEqual(0.45);

        fireEvent.click(receipt);
        const item = await screen.findByText('Oat Milk'); // receipt editor mounted
        expect(effectiveOpacity(item)).toBeGreaterThanOrEqual(0.45);

        fireEvent.click(screen.getByRole('tab', { name: 'Settings' }));
        expect(await screen.findByText('Receipt Settings')).toBeInTheDocument();
    });

    it('while the tab is hidden, animations are skipped so content is fully opaque', async () => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
        try {
            render(<App />);
            const card = await screen.findByText('Roomies');
            expect(effectiveOpacity(card)).toBe(1);
        } finally {
            Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
            document.dispatchEvent(new Event('visibilitychange'));
        }
    });
});
