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

    it('surfaces a load error without crashing, and clears loading', async () => {
        api.listGroups.mockRejectedValue(new Error('offline'));
        render(<AppDataProvider userId={ME}><Probe /></AppDataProvider>);
        await waitFor(() => expect(ctx.error).toBe('offline'));
        expect(ctx.loading).toBe(false);
    });
});
