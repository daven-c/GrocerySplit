// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

vi.mock('../../lib/api', async () => (await import('../../test/apiMock')).apiMock);
vi.mock('../../lib/supabase', async () => (await import('../../test/apiMock')).supabaseModule);

import { apiMock as api, authMock, resetMocks, ME, signedInSession } from '../../test/apiMock';
import App from '../../App';
import Landing from '../Landing';
import Auth from '../Auth';
import ErrorBoundary from '../ErrorBoundary';

const signIn = () => authMock.getSession.mockResolvedValue({ data: { session: signedInSession } });
const narrowScreen = () => { (window as any).matchMedia = (q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }); };

beforeEach(resetMocks);
afterEach(cleanup);

describe('Landing', () => {
    it('sells general cost splitting, with groceries as one use', () => {
        render(<Landing onSignIn={vi.fn()} onGetStarted={vi.fn()} />);
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Split any cost, down to the penny.');
        expect(screen.getByText(/Groceries, rent, bills and trips/)).toBeInTheDocument();
        expect(screen.getByText('Three steps from crumpled receipt to settled up.')).toBeInTheDocument();
        expect(screen.getByText('Add the cost')).toBeInTheDocument();
        expect(screen.getByText('Exact, every time')).toBeInTheDocument();
        expect(screen.getByText('One balance per friend')).toBeInTheDocument();
        expect(screen.getByText('Your next shared cost is the easy one.')).toBeInTheDocument();
        expect(screen.getByText(/Splitpot · costsplit\.davenc\.dev/)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'How it works' })).toHaveAttribute('href', '#how');
    });

    it('all calls to action go to sign-up, and Sign in goes to sign-in', async () => {
        const u = userEvent.setup();
        const onSignIn = vi.fn(), onGetStarted = vi.fn();
        render(<Landing onSignIn={onSignIn} onGetStarted={onGetStarted} />);
        await u.click(screen.getByRole('button', { name: 'Sign in' }));
        expect(onSignIn).toHaveBeenCalled();
        for (const name of ['Get started', 'Start a group, free', 'Create your first group']) await u.click(screen.getByRole('button', { name }));
        expect(onGetStarted).toHaveBeenCalledTimes(3);
    });
});

describe('Auth', () => {
    it('sign up reveals the name field with the new copy; sign in hides it', async () => {
        const u = userEvent.setup();
        render(<Auth initialMode="signup" onLogin={vi.fn()} />);
        expect(screen.getByRole('heading', { name: 'Start a pot' })).toBeInTheDocument();
        expect(screen.getByPlaceholderText('What your friends call you')).toBeInTheDocument();
        expect(screen.getByText('Invites are matched to your email, so sign up with the address your friends know.')).toBeInTheDocument();
        await u.click(screen.getByRole('tab', { name: 'Sign in' }));
        expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
        await waitFor(() => expect(screen.queryByPlaceholderText('What your friends call you')).not.toBeInTheDocument());
        expect(screen.getByText('Sign in to see who owes what.')).toBeInTheDocument();
    });

    it('signs in and calls onLogin; shows errors in coral', async () => {
        const u = userEvent.setup();
        const onLogin = vi.fn();
        render(<Auth onLogin={onLogin} />);
        await u.type(screen.getByLabelText('Email'), ' me@x.com ');
        await u.type(screen.getByLabelText('Password'), 'secret12');
        await u.click(screen.getByRole('button', { name: 'Sign in' }));
        await waitFor(() => expect(authMock.signInWithPassword).toHaveBeenCalledWith({ email: 'me@x.com', password: 'secret12' }));
        expect(onLogin).toHaveBeenCalled();

        authMock.signInWithPassword.mockResolvedValueOnce({ error: { message: 'Invalid login credentials' } } as any);
        await u.click(screen.getByRole('button', { name: 'Sign in' }));
        expect(await screen.findByText('Invalid login credentials')).toBeInTheDocument();
    });

    it('sign up sends the name and shows the confirm-email notice; rate limits get friendly copy', async () => {
        const u = userEvent.setup();
        render(<Auth initialMode="signup" onLogin={vi.fn()} />);
        await u.type(screen.getByLabelText('Your name'), 'Sam');
        await u.type(screen.getByLabelText('Email'), 'sam@x.com');
        await u.type(screen.getByLabelText('Password'), 'secret12');
        await u.click(screen.getByRole('button', { name: 'Create account' }));
        await waitFor(() => expect(authMock.signUp).toHaveBeenCalledWith({ email: 'sam@x.com', password: 'secret12', options: { data: { name: 'Sam' } } }));
        expect(await screen.findByText('Account created! Check your email for a confirmation link, then sign in.')).toBeInTheDocument();

        authMock.signUp.mockResolvedValueOnce({ data: { session: null }, error: { message: 'email rate limit exceeded' } } as any);
        await u.click(screen.getByRole('button', { name: 'Create account' }));
        expect(await screen.findByText(/Too many sign-up emails were sent recently/)).toBeInTheDocument();
    });

    it('password visibility toggle works and the logo goes back', async () => {
        const u = userEvent.setup();
        const onBack = vi.fn();
        render(<Auth onLogin={vi.fn()} onBack={onBack} />);
        const pw = screen.getByLabelText('Password');
        expect(pw).toHaveAttribute('type', 'password');
        await u.click(screen.getByLabelText('Show password'));
        expect(pw).toHaveAttribute('type', 'text');
        await u.click(screen.getByRole('button', { name: 'Back to the home page' }));
        expect(onBack).toHaveBeenCalled();
    });
});

describe('App shell', () => {
    it('signed out: landing page, then sign-up or sign-in screens, and back', async () => {
        const u = userEvent.setup();
        render(<App />);
        expect(await screen.findByRole('heading', { level: 1, name: /Split any cost/ })).toBeInTheDocument();
        await u.click(screen.getByRole('button', { name: 'Get started' }));
        expect(await screen.findByRole('heading', { name: 'Start a pot' })).toBeInTheDocument();
        await u.click(screen.getByRole('button', { name: 'Back to the home page' }));
        expect(await screen.findByRole('heading', { level: 1, name: /Split any cost/ })).toBeInTheDocument();
        await u.click(screen.getByRole('button', { name: 'Sign in' }));
        expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    });

    it('signed in (wide): sidebar with nav, groups and you; Home shows balances', async () => {
        signIn();
        render(<App />);
        const sidebar = await screen.findByRole('complementary', { name: 'Sidebar' });
        expect(within(sidebar).getByText('splitpot')).toBeInTheDocument();
        for (const n of ['Home', 'Friends', 'Account']) expect(within(sidebar).getByRole('button', { name: new RegExp(n) })).toBeInTheDocument();
        expect(within(sidebar).queryByRole('button', { name: /Admin/ })).not.toBeInTheDocument();
        expect(await within(sidebar).findByRole('button', { name: 'Roomies' })).toBeInTheDocument();
        expect(within(sidebar).getByText('Daven Chang')).toBeInTheDocument();
        expect(within(sidebar).getByText('me@x.com')).toBeInTheDocument();
        expect(await screen.findByText(/^(Morning|Afternoon|Evening), Daven$/)).toBeInTheDocument();
        expect(screen.queryByRole('navigation', { name: 'Primary' })?.closest('aside')).toBeTruthy(); // nav lives in the sidebar
    });

    it('navigates Home → group → receipt → back, Friends, Account, and signs out to the landing page', async () => {
        const u = userEvent.setup();
        signIn();
        render(<App />);
        const sidebar = await screen.findByRole('complementary', { name: 'Sidebar' });
        await u.click(await within(sidebar).findByRole('button', { name: 'Roomies' }));
        expect(await screen.findByRole('heading', { name: 'Roomies' })).toBeInTheDocument();
        await u.click(await screen.findByText('Costco'));
        expect(await screen.findByDisplayValue('Costco')).toBeInTheDocument();
        await u.click(within(screen.getByRole('main')).getByRole('button', { name: /Roomies/ })); // back link names the group
        expect(await screen.findByRole('heading', { name: 'Roomies' })).toBeInTheDocument();
        await u.click(await screen.findByText('October rent'));
        expect(await screen.findByLabelText('Expense name')).toBeInTheDocument(); // expenses open the expense editor
        await u.click(within(sidebar).getByRole('button', { name: 'Friends' }));
        expect(await screen.findByRole('heading', { name: 'Friends' })).toBeInTheDocument();
        await u.click(within(sidebar).getByRole('button', { name: 'Account' }));
        expect(await screen.findByLabelText('Display name')).toBeInTheDocument();
        await u.click(screen.getByRole('button', { name: /Sign out/ }));
        await waitFor(() => expect(authMock.signOut).toHaveBeenCalled());
        expect(await screen.findByRole('heading', { level: 1, name: /Split any cost/ })).toBeInTheDocument();
    });

    it('scrolls to the top on every view change', async () => {
        const u = userEvent.setup();
        signIn();
        render(<App />);
        const sidebar = await screen.findByRole('complementary', { name: 'Sidebar' });
        (window.scrollTo as any).mockClear();
        await u.click(within(sidebar).getByRole('button', { name: 'Friends' }));
        await waitFor(() => expect(window.scrollTo).toHaveBeenCalledWith(0, 0));
    });

    it('shows an invite count on Home and the sidebar "+" opens the group creator', async () => {
        const u = userEvent.setup();
        signIn();
        api.myInvites.mockResolvedValue([{ id: 'i', group_id: 'g9', group_name: 'Book Club', inviter_name: 'Sam', created_at: '2026-10-05' }]);
        render(<App />);
        const sidebar = await screen.findByRole('complementary', { name: 'Sidebar' });
        expect(await within(sidebar).findByRole('button', { name: /Home\s*1/ })).toBeInTheDocument();
        await u.click(within(sidebar).getByRole('button', { name: 'New group' }));
        expect(await screen.findByLabelText('Group name')).toBeInTheDocument();
    });

    it('admins get an Admin nav item', async () => {
        const u = userEvent.setup();
        signIn();
        api.isAdmin.mockResolvedValue(true);
        render(<App />);
        const sidebar = await screen.findByRole('complementary', { name: 'Sidebar' });
        await u.click(await within(sidebar).findByRole('button', { name: /Admin/ }));
        expect(await screen.findByRole('heading', { name: 'Admin' })).toBeInTheDocument();
    });

    it('narrow screens get a header with the logo and a bottom tab bar instead of the sidebar', async () => {
        const u = userEvent.setup();
        narrowScreen();
        signIn();
        render(<App />);
        const tabs = await screen.findByRole('navigation', { name: 'Primary' });
        expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
        expect(within(tabs).getAllByRole('button').map(b => b.textContent)).toEqual(['home' + 'Home', 'group' + 'Friends', 'person' + 'Account']);
        expect(screen.getByRole('banner')).toHaveTextContent('splitpot');
        await u.click(within(tabs).getByRole('button', { name: /Friends/ }));
        expect(await screen.findByRole('heading', { name: 'Friends' })).toBeInTheDocument();
        expect(screen.getByRole('banner')).toHaveTextContent('Friends');
        expect(within(tabs).getByRole('button', { name: /Friends/ })).toHaveAttribute('aria-current', 'page');
    });

    it('narrow: inside a group the header shows a back arrow and the group name', async () => {
        const u = userEvent.setup();
        narrowScreen();
        signIn();
        render(<App />);
        await u.click(await screen.findByRole('button', { name: /Roomies/ }));
        const header = await screen.findByRole('banner');
        await waitFor(() => expect(header).toHaveTextContent('Roomies'));
        await u.click(within(header).getByRole('button', { name: 'Back' }));
        expect(await screen.findByText(/^(Morning|Afternoon|Evening), Daven$/)).toBeInTheDocument();
    });
});

describe('Drafts in the app shell', () => {
    const draftExpense = async () => ({ ...(await import('../../test/apiMock')).rent, id: 's9', draft: true, name: 'New expense', amount: 0, split_method: 'exact' as const, split_data: { [ME]: 0, 'u-amy': 0, 'u-bo': 0 } });
    const startDraft = async () => {
        const u = userEvent.setup();
        signIn();
        const base = api.getSession.getMockImplementation()!;
        api.getSession.mockImplementation(async (id: string) => (id === 's9' ? structuredClone(await draftExpense()) : base(id)));
        render(<App />);
        const sidebar = await screen.findByRole('complementary', { name: 'Sidebar' });
        await u.click(await within(sidebar).findByRole('button', { name: 'Roomies' }));
        await u.click(await screen.findByRole('button', { name: /Add expense/ }));
        await u.click(await screen.findByText('Add an expense'));
        await screen.findByRole('region', { name: 'Unsaved draft' });
        return { u, sidebar };
    };

    it('adding an expense opens an unsaved draft that nobody else sees', async () => {
        await startDraft();
        expect(api.createSession).toHaveBeenCalledWith(expect.objectContaining({ kind: 'expense', draft: true }));
        expect(api.deleteSession).not.toHaveBeenCalled();
    });

    it('leaving without saving (sidebar, back) discards the draft', async () => {
        const { u, sidebar } = await startDraft();
        await u.click(within(sidebar).getByRole('button', { name: 'Friends' }));
        await waitFor(() => expect(api.deleteSession).toHaveBeenCalledWith('s9'));
        expect(await screen.findByRole('heading', { name: 'Friends' })).toBeInTheDocument();
    });

    it('Discard deletes the draft and returns to the group', async () => {
        const { u } = await startDraft();
        await u.click(screen.getByRole('button', { name: 'Discard' }));
        await waitFor(() => expect(api.deleteSession).toHaveBeenCalledWith('s9'));
        expect(await screen.findByRole('heading', { name: 'Roomies' })).toBeInTheDocument();
    });

    it('"By item" and back: the same draft moves between the two editors and is never discarded by the switch', async () => {
        const u = userEvent.setup();
        signIn();
        let rec: any = structuredClone(await draftExpense());
        api.getSession.mockImplementation(async (id: string) => (id === 's9' ? structuredClone(rec) : structuredClone((await import('../../test/apiMock')).sessions.find(x => x.id === id)!)));
        api.updateSession.mockImplementation(async (_id: string, patch: any) => { rec = { ...rec, ...patch }; });
        render(<App />);
        const sidebar = await screen.findByRole('complementary', { name: 'Sidebar' });
        await u.click(await within(sidebar).findByRole('button', { name: 'Roomies' }));
        await u.click(await screen.findByRole('button', { name: /Add expense/ }));
        await u.click(await screen.findByText('Add an expense'));
        await screen.findByLabelText('How much was it?'); // the amount-based body

        await u.click(screen.getByRole('tab', { name: 'By item' }));
        expect(await screen.findByRole('button', { name: /Add an item/ })).toBeInTheDocument(); // the itemized body
        expect(screen.getByRole('tab', { name: 'By item', selected: true })).toBeInTheDocument();
        expect(screen.getByRole('region', { name: 'Unsaved draft' })).toBeInTheDocument(); // still a draft
        expect(api.deleteSession).not.toHaveBeenCalled();

        await u.click(screen.getByRole('tab', { name: 'Percent' }));
        expect(await screen.findByLabelText('How much was it?')).toBeInTheDocument(); // back to the amount body
        expect(screen.getByRole('tab', { name: 'Percent', selected: true })).toBeInTheDocument();
        expect(screen.getByRole('region', { name: 'Unsaved draft' })).toBeInTheDocument();
        expect(api.deleteSession).not.toHaveBeenCalled();
    });

    it('Save publishes it (not deleted) and returns to the group', async () => {
        const { u } = await startDraft();
        await u.click(screen.getByRole('button', { name: 'Save expense' }));
        await waitFor(() => expect(api.updateSession).toHaveBeenCalledWith('s9', expect.objectContaining({ draft: false })));
        expect(await screen.findByRole('heading', { name: 'Roomies' })).toBeInTheDocument();
        await new Promise(r => setTimeout(r, 300));
        expect(api.deleteSession).not.toHaveBeenCalled();
    });
});

describe('Startup never leaves a blank page', () => {
    it('shows a loading spinner while the session restores', () => {
        authMock.getSession.mockReturnValue(new Promise(() => {}));
        render(<App />);
        expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    });

    it('a failed session restore falls back to the landing page', async () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        authMock.getSession.mockRejectedValue(new Error('Lock timed out'));
        render(<App />);
        expect(await screen.findByRole('heading', { level: 1, name: /Split any cost/ })).toBeInTheDocument();
        spy.mockRestore();
    });

    it('a hung restore times out to the landing page, and a late session still reaches the app', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        let listener: any;
        authMock.getSession.mockReturnValue(new Promise(() => {}));
        authMock.onAuthStateChange.mockImplementation((cb: any) => { listener = cb; return { data: { subscription: { unsubscribe() {} } } }; });
        render(<App />);
        await act(async () => { await vi.advanceTimersByTimeAsync(6100); });
        expect(await screen.findByRole('heading', { level: 1, name: /Split any cost/ })).toBeInTheDocument();
        act(() => listener('SIGNED_IN', signedInSession));
        expect(await screen.findByRole('complementary', { name: 'Sidebar' })).toBeInTheDocument();
        warn.mockRestore();
        vi.useRealTimers();
    });

    it('ErrorBoundary offers a reload instead of a blank page', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const Boom = () => { throw new Error('boom'); };
        render(<ErrorBoundary><Boom /></ErrorBoundary>);
        expect(screen.getByText('Something went wrong')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
        spy.mockRestore();
    });
});
