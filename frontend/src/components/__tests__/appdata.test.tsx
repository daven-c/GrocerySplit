// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('../../lib/api', async () => (await import('../../test/apiMock')).apiMock);
vi.mock('../../lib/supabase', async () => (await import('../../test/apiMock')).supabaseModule);

import { apiMock as api, resetMocks, ME, group } from '../../test/apiMock';
import { AppDataProvider, useAppData } from '../../lib/appData';

beforeEach(resetMocks);
afterEach(cleanup);

let ctx: ReturnType<typeof useAppData>;
function Probe() {
    ctx = useAppData();
    return <div>{ctx.loading ? 'loading' : ctx.groups.map(g => g.name).join(',') || 'none'}</div>;
}

describe('AppDataProvider', () => {
    it('loads everything once, exposes it, and refreshes on demand', async () => {
        render(<AppDataProvider userId={ME}><Probe /></AppDataProvider>);
        expect(await screen.findByText('Roomies,Ski Trip')).toBeInTheDocument();
        expect(ctx.me).toBe(ME);
        expect(ctx.sessions).toHaveLength(3);
        const before = api.listGroups.mock.calls.length;
        await act(async () => { await ctx.refresh(); });
        expect(api.listGroups.mock.calls.length).toBe(before + 1);
    });

    it('when two refreshes overlap and finish out of order, the newest response wins', async () => {
        render(<AppDataProvider userId={ME}><Probe /></AppDataProvider>);
        await screen.findByText('Roomies,Ski Trip');
        let releaseSlow!: (v: unknown) => void;
        const slow = new Promise(r => { releaseSlow = r; });
        api.listGroups.mockImplementationOnce(() => slow as any); // refresh #1: slow, stale
        api.listGroups.mockResolvedValueOnce([{ ...group, name: 'Newest' }]); // refresh #2: fast, current
        let p1!: Promise<void>, p2!: Promise<void>;
        await act(async () => { p1 = ctx.refresh(); p2 = ctx.refresh(); await p2; });
        expect(await screen.findByText('Newest')).toBeInTheDocument();
        await act(async () => { releaseSlow([{ ...group, name: 'Stale' }]); await p1; });
        expect(screen.getByText('Newest')).toBeInTheDocument(); // the stale response did not overwrite it
        expect(screen.queryByText('Stale')).not.toBeInTheDocument();
    });

    it('never exposes unsaved drafts, and tidies stale ones on load', async () => {
        const { rent } = await import('../../test/apiMock');
        api.listSessions.mockResolvedValue([rent, { ...rent, id: 'draft1', name: 'Half-typed', draft: true }]);
        render(<AppDataProvider userId={ME}><Probe /></AppDataProvider>);
        await screen.findByText('Roomies,Ski Trip');
        expect(ctx.sessions.map(s => s.id)).toEqual(['s2']);
        expect(api.deleteStaleDrafts).toHaveBeenCalled();
    });

    it('surfaces a load error without crashing, and clears loading', async () => {
        api.listGroups.mockRejectedValue(new Error('offline'));
        render(<AppDataProvider userId={ME}><Probe /></AppDataProvider>);
        await waitFor(() => expect(ctx.error).toBe('offline'));
        expect(ctx.loading).toBe(false);
    });
});

describe('AppDataProvider keeps shared data fresh', () => {
    const setVisibility = (v: 'visible' | 'hidden') => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
    afterEach(() => { vi.useRealTimers(); setVisibility('visible'); });

    it('re-fetches when the person returns to the tab, but not on every quick flip', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        render(<AppDataProvider userId={ME}><Probe /></AppDataProvider>);
        await screen.findByText('Roomies,Ski Trip');
        const before = api.listGroups.mock.calls.length;

        act(() => { vi.advanceTimersByTime(11_000); });
        await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
        await waitFor(() => expect(api.listGroups.mock.calls.length).toBe(before + 1));

        await act(async () => { document.dispatchEvent(new Event('visibilitychange')); }); // straight away again
        expect(api.listGroups.mock.calls.length).toBe(before + 1);
    });

    it('picks up other people\'s changes on the one-minute check, and skips it while a field is focused or the tab is hidden', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        render(<AppDataProvider userId={ME}><Probe /><input aria-label="typing" /></AppDataProvider>);
        await screen.findByText('Roomies,Ski Trip');
        const before = api.listGroups.mock.calls.length;
        api.listGroups.mockResolvedValue([{ ...group, name: 'Renamed by Amy' }]);

        setVisibility('hidden');
        await act(async () => { vi.advanceTimersByTime(61_000); });
        expect(api.listGroups.mock.calls.length).toBe(before); // hidden: no polling

        setVisibility('visible');
        screen.getByLabelText('typing').focus();
        await act(async () => { vi.advanceTimersByTime(61_000); });
        expect(api.listGroups.mock.calls.length).toBe(before); // typing: leave the screen alone

        (document.activeElement as HTMLElement).blur();
        await act(async () => { vi.advanceTimersByTime(61_000); });
        expect(await screen.findByText('Renamed by Amy')).toBeInTheDocument();
    });

    it('a failed background top-up keeps what is on screen and shows no error', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        render(<AppDataProvider userId={ME}><Probe /></AppDataProvider>);
        await screen.findByText('Roomies,Ski Trip');
        api.listGroups.mockRejectedValue(new Error('offline'));
        await act(async () => { vi.advanceTimersByTime(61_000); });
        await waitFor(() => expect(api.listGroups).toHaveBeenCalledTimes(2));
        expect(screen.getByText('Roomies,Ski Trip')).toBeInTheDocument();
        expect(ctx.error).toBe('');
    });
});
