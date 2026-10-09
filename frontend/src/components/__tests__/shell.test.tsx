// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

vi.mock('../../lib/api', async () => (await import('../../test/apiMock')).apiMock);
vi.mock('../../lib/supabase', async () => (await import('../../test/apiMock')).supabaseModule);

import { apiMock as api, resetMocks, ME, group } from '../../test/apiMock';
import { AppDataProvider } from '../../lib/appData';
import Shell, { ShellView } from '../Shell';

beforeEach(resetMocks);
afterEach(cleanup);

const user = { id: ME, name: 'Daven Chang', email: 'me@x.com' };
function setup(over: { view?: ShellView; narrow?: boolean; groupId?: string | null } = {}) {
    const p = { onNav: vi.fn(), onOpenGroup: vi.fn(), onNewGroup: vi.fn(), onBack: vi.fn() };
    render(
        <AppDataProvider userId={ME}>
            <Shell view={over.view ?? 'home'} narrow={over.narrow ?? false} user={user} groupId={over.groupId ?? null} recordId={null} {...p}>
                <div>page content</div>
            </Shell>
        </AppDataProvider>
    );
    return p;
}

describe('Shell (wide)', () => {
    it('shows Home, People and Personal, marks the current one, and sends navigation up', async () => {
        const u = userEvent.setup();
        const p = setup();
        const nav = await screen.findByRole('navigation', { name: 'Primary' });
        expect(within(nav).getByRole('button', { name: /Home/ })).toHaveAttribute('aria-current', 'page');
        expect(within(nav).queryByRole('button', { name: 'Admin' })).not.toBeInTheDocument(); // not an admin
        await u.click(within(nav).getByRole('button', { name: 'People' }));
        expect(p.onNav).toHaveBeenCalledWith('friends');
        await u.click(within(nav).getByRole('button', { name: 'Personal' }));
        expect(p.onNav).toHaveBeenCalledWith('personal');
        await u.click(screen.getByRole('button', { name: 'Account' }));
        expect(p.onNav).toHaveBeenCalledWith('account');
        await u.click(screen.getByRole('button', { name: 'Settled home' }));
        expect(p.onNav).toHaveBeenCalledWith('home');
        expect(screen.getByText('page content')).toBeInTheDocument();
    });

    it('only an admin sees Admin', async () => {
        api.isAdmin.mockResolvedValue(true);
        setup();
        expect(await screen.findByRole('button', { name: 'Admin' })).toBeInTheDocument();
    });

    it('the Home badge counts invites waiting for you', async () => {
        api.myInvites.mockResolvedValue([{ id: 'inv1', group_id: 'g9', group_name: 'Book Club', inviter_name: 'Sam', created_at: '2026-10-05T00:00:00Z' }]);
        setup();
        const home = await screen.findByRole('button', { name: /Home/ });
        await waitFor(() => expect(home).toHaveTextContent(/Home\s*1/));
    });

    it('inside a group Home stays marked; inside your Personal section Personal is', async () => {
        api.listGroups.mockResolvedValue([group, { id: 'gp', name: 'Personal', owner_id: ME, created_at: '2026-01-01', personal: true, members: [group.members[0]] }]);
        setup({ view: 'group', groupId: 'g1' });
        const nav = await screen.findByRole('navigation', { name: 'Primary' });
        expect(within(nav).getByRole('button', { name: /Home/ })).toHaveAttribute('aria-current', 'page');
        cleanup();
        setup({ view: 'group', groupId: 'gp' });
        const nav2 = await screen.findByRole('navigation', { name: 'Primary' });
        await waitFor(() => expect(within(nav2).getByRole('button', { name: 'Personal' })).toHaveAttribute('aria-current', 'page'));
        expect(within(nav2).getByRole('button', { name: /Home/ })).not.toHaveAttribute('aria-current');
    });
});

describe('Shell (phone)', () => {
    it('Home has the green band with the greeting; other screens get a header with Back and the title', async () => {
        setup({ narrow: true });
        expect(await screen.findByText(/Overall you're/)).toBeInTheDocument();
        cleanup();
        const p = setup({ narrow: true, view: 'group', groupId: 'g1' });
        const back = await screen.findByRole('button', { name: 'Back' });
        await userEvent.setup().click(back);
        expect(p.onBack).toHaveBeenCalled();
        await waitFor(() => expect(screen.getAllByText('Roomies').length).toBeGreaterThan(0)); // the header title
    });

    it('has a bottom tab bar with the same destinations', async () => {
        const u = userEvent.setup();
        const p = setup({ narrow: true });
        await screen.findByText(/Overall you're/);
        await u.click(screen.getByRole('button', { name: 'People' }));
        expect(p.onNav).toHaveBeenCalledWith('friends');
    });
});
