// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

vi.mock('../../lib/api', async () => (await import('../../test/apiMock')).apiMock);
vi.mock('../../lib/supabase', async () => (await import('../../test/apiMock')).supabaseModule);

import { apiMock as api, authMock, resetMocks, ME, group, signedInSession } from '../../test/apiMock';
import { renderWithData } from '../../test/render';
import { a11yProblems } from '../../test/a11y';
import Landing from '../Landing';
import Auth from '../Auth';
import Dashboard from '../Dashboard';
import GroupDetail from '../GroupDetail';
import ExpenseEditor from '../ExpenseEditor';
import Split from '../Split';
import Friends from '../Friends';
import Account from '../Account';
import ReceiptPhotos from '../ReceiptPhotos';
import ResetPassword from '../ResetPassword';
import QuickSplit from '../QuickSplit';
import Admin from '../Admin';
import App from '../../App';
import { Toaster, toast } from '../Toast';

beforeEach(resetMocks);
afterEach(cleanup);

const gProps = { groupId: 'g1', narrow: false, onBack: vi.fn(), onOpenRecord: vi.fn() };

describe('accessibility (axe, everything except colour contrast)', () => {
    it('Landing', async () => { render(<Landing onSignIn={vi.fn()} onGetStarted={vi.fn()} />); expect(await a11yProblems()).toEqual([]); });
    it('Sign in, create account and forgot password', async () => {
        const u = userEvent.setup();
        render(<Auth onLogin={vi.fn()} />);
        expect(await a11yProblems()).toEqual([]);
        await u.click(screen.getByRole('tab', { name: 'Create account' }));
        expect(await a11yProblems()).toEqual([]);
        await u.click(screen.getByRole('tab', { name: 'Sign in' }));
        await u.click(screen.getByRole('button', { name: 'Forgot password?' }));
        expect(await a11yProblems()).toEqual([]);
    });
    it('Home', async () => { renderWithData(<Dashboard user={{ id: ME, name: 'Daven Chang' }} narrow={false} newGroupTick={0} onOpenGroup={vi.fn()} onGoFriends={vi.fn()} />); await screen.findByText('Roomies'); expect(await a11yProblems()).toEqual([]); });
    it('a group (expenses, balances, members)', async () => {
        const u = userEvent.setup();
        renderWithData(<GroupDetail {...gProps} />);
        await screen.findByRole('tab', { name: /Expenses/ });
        expect(await a11yProblems()).toEqual([]);
        await u.click(screen.getByRole('tab', { name: 'Balances' }));
        expect(await a11yProblems()).toEqual([]);
        await u.click(screen.getByRole('tab', { name: /Members/ }));
        expect(await a11yProblems()).toEqual([]);
    });
    it('Personal (balances and people)', async () => {
        const u = userEvent.setup();
        api.listGroups.mockResolvedValue([{ id: 'gp', name: 'Personal', owner_id: ME, created_at: '2026-01-01', personal: true, members: [group.members[0]] }, group]);
        renderWithData(<GroupDetail {...gProps} groupId="gp" />);
        await screen.findByRole('heading', { name: 'Personal' });
        expect(await a11yProblems()).toEqual([]);
        await u.click(screen.getByRole('tab', { name: /People/ }));
        expect(await a11yProblems()).toEqual([]);
    });
    it('the Add menu and a confirm dialog', async () => {
        const u = userEvent.setup();
        renderWithData(<GroupDetail {...gProps} />);
        await screen.findByRole('tab', { name: /Expenses/ });
        await u.click(screen.getByRole('button', { name: /Add expense/ }));
        expect(await a11yProblems()).toEqual([]);
    });
    it('the transfer dialog', async () => {
        const u = userEvent.setup();
        renderWithData(<GroupDetail {...gProps} />);
        await screen.findByRole('tab', { name: /Expenses/ });
        await u.click(screen.getByRole('button', { name: /Add expense/ }));
        await u.click(await screen.findByRole('menuitem', { name: /Record a transfer/ }));
        expect(await screen.findByRole('dialog', { name: 'Record a transfer' })).toBeInTheDocument();
        expect(await a11yProblems()).toEqual([]);
    });
    it('the new-password screen', async () => {
        render(<ResetPassword onDone={vi.fn()} onCancel={vi.fn()} />);
        expect(await a11yProblems()).toEqual([]);
    });
    it('a quick split draft', async () => {
        render(<QuickSplit token={null} />);
        await screen.findByText('Nothing is saved yet');
        expect(await a11yProblems()).toEqual([]);
    });
    it('Admin', async () => {
        api.isAdmin.mockResolvedValue(true);
        renderWithData(<Admin />);
        await screen.findByText('ddchang@x.com');
        expect(await a11yProblems()).toEqual([]);
    });
    it('the expense editor', async () => {
        api.getSession.mockResolvedValue((await import('../../test/apiMock')).rent);
        renderWithData(<ExpenseEditor sessionId="s2" narrow={false} onBack={vi.fn()} onSaved={vi.fn()} onDiscard={vi.fn()} onSwitched={vi.fn()} />);
        await screen.findByLabelText('Expense name');
        expect(await a11yProblems()).toEqual([]);
    });
    it('the itemized receipt editor', async () => {
        renderWithData(<Split sessionId="s1" narrow={false} onBack={vi.fn()} onSaved={vi.fn()} onSwitched={vi.fn()} onImport={vi.fn()} onDiscard={vi.fn()} />);
        await screen.findByText('Chicken Breast');
        expect(await a11yProblems()).toEqual([]);
    });
    it('People and Account', async () => {
        renderWithData(<Friends />);
        await screen.findByRole('heading', { name: 'People' });
        await waitFor(() => expect(screen.getByText('$1,182.82')).toBeInTheDocument(), { timeout: 3000 });
        expect(await a11yProblems()).toEqual([]);
        cleanup();
        renderWithData(<Account user={{ id: ME, email: 'me@x.com', name: 'Daven' }} onLogout={vi.fn()} />);
        await screen.findByRole('heading', { name: 'Daven' });
        expect(await a11yProblems()).toEqual([]);
    });
    it('photos, with a photo and the viewer open', async () => {
        const u = userEvent.setup();
        api.listPhotos.mockResolvedValue([{ id: 'p1', path: 'g1/s1/1.jpg', url: 'https://x/1.jpg' }]);
        render(<ReceiptPhotos sessionId="s1" groupId="g1" />);
        await u.click(await screen.findByRole('button', { name: 'Open photo 1' }));
        await screen.findByRole('dialog');
        expect(await a11yProblems()).toEqual([]);
    });
});

describe('orientation and announcements', () => {
    it('the tab title says where you are, and there is a skip link to the content', async () => {
        const u = userEvent.setup();
        authMock.getSession.mockResolvedValue({ data: { session: signedInSession } });
        render(<App />);
        await screen.findByText(/Overall you're/);
        expect(document.title).toBe('Settled');
        const skip = screen.getByRole('link', { name: 'Skip to content' });
        expect(skip).toHaveAttribute('href', '#main-content');
        expect(document.getElementById('main-content')).toBeInTheDocument();
        await u.click(screen.getByRole('button', { name: 'People' }));
        await waitFor(() => expect(document.title).toBe('People · Settled'));
    });

    it('toasts are announced through a live region that is always on the page', async () => {
        render(<Toaster />);
        const region = screen.getByRole('status');
        expect(region).toHaveAttribute('aria-live', 'polite');
        expect(region).toBeEmptyDOMElement();
        act(() => toast('Changes saved'));
        expect(await screen.findByText('Changes saved')).toBeInTheDocument();
        expect(region).toHaveTextContent('Changes saved');
    });
});

describe('search engines', () => {
    it('the landing page links to the guides with real links', () => {
        render(<Landing onSignIn={vi.fn()} onGetStarted={vi.fn()} />);
        const nav = screen.getByRole('navigation', { name: 'Guides' });
        expect(nav.querySelectorAll('a')).toHaveLength(4);
        expect(screen.getByRole('link', { name: 'Split rent fairly' })).toHaveAttribute('href', '/guides/split-rent-fairly');
    });

    it('a quick split asks to be left out of search results, and takes the request away when it closes', async () => {
        const { unmount } = render(<QuickSplit token={null} />);
        await screen.findByText('Nothing is saved yet');
        expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
        unmount();
        expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
    });
});
