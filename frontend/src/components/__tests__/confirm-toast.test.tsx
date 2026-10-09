// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

vi.mock('../../lib/api', async () => (await import('../../test/apiMock')).apiMock);
vi.mock('../../lib/supabase', async () => (await import('../../test/apiMock')).supabaseModule);

import { apiMock as api, resetMocks } from '../../test/apiMock';
import ConfirmDialog from '../ConfirmDialog';
import QuickSplitList from '../QuickSplitList';
import { Toaster, toast, toastError } from '../Toast';
import { messageOf, codeOf } from '../../lib/errors';

beforeEach(resetMocks);
afterEach(cleanup);

describe('ConfirmDialog', () => {
    const setup = (busy = false) => {
        const onConfirm = vi.fn(), onClose = vi.fn();
        render(<ConfirmDialog open title="Delete thing?" body={<>This removes <strong>it</strong>.</>} confirmLabel="Delete" onConfirm={onConfirm} onClose={onClose} busy={busy} />);
        return { onConfirm, onClose };
    };

    it('names itself, shows what will happen, and confirms or cancels', async () => {
        const u = userEvent.setup();
        const { onConfirm, onClose } = setup();
        const dialog = await screen.findByRole('dialog', { name: 'Delete thing?' });
        expect(dialog).toHaveTextContent('This removes it.');
        await u.click(screen.getByRole('button', { name: 'Delete' }));
        expect(onConfirm).toHaveBeenCalledTimes(1);
        await u.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('while busy, neither button works and Escape does not close it', async () => {
        const u = userEvent.setup();
        const { onClose } = setup(true);
        await screen.findByRole('dialog');
        expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
        await u.keyboard('{Escape}');
        expect(onClose).not.toHaveBeenCalled();
    });
});

describe('toasts', () => {
    it('an error toast is announced assertively and styled as an error, a normal one politely', async () => {
        render(<Toaster />);
        const region = screen.getByRole('status');
        act(() => toast('Saved'));
        expect(await screen.findByText('Saved')).toBeInTheDocument();
        expect(region).toHaveAttribute('aria-live', 'polite');
        act(() => toastError('Could not save'));
        expect(await screen.findByText('Could not save')).toBeInTheDocument();
        expect(region).toHaveAttribute('aria-live', 'assertive');
    });
});

describe('quick splits on Home', () => {
    it('says so when they could not be loaded (and does not claim there are none)', async () => {
        api.listMyQuickSplits.mockRejectedValue(new Error('offline'));
        render(<QuickSplitList />);
        expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your quick splits");
        await waitFor(() => expect(screen.queryByText(/None yet/)).not.toBeInTheDocument());
    });
});

describe('error helpers', () => {
    it('messageOf reads Errors, Supabase-style objects and strings, and falls back otherwise', () => {
        expect(messageOf(new Error('boom'), 'x')).toBe('boom');
        expect(messageOf({ message: 'db says no', code: '42' }, 'x')).toBe('db says no');
        expect(messageOf('plain', 'x')).toBe('plain');
        expect(messageOf(undefined, 'fallback')).toBe('fallback');
        expect(messageOf({ message: '' }, 'fallback')).toBe('fallback');
        expect(messageOf(42, 'fallback')).toBe('fallback');
    });
    it('codeOf reads a string code only', () => {
        expect(codeOf({ code: 'email_not_confirmed' })).toBe('email_not_confirmed');
        expect(codeOf({ code: 42 })).toBeUndefined();
        expect(codeOf(null)).toBeUndefined();
    });
});
