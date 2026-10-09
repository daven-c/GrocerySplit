// @vitest-environment jsdom
import { useState } from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { Modal } from '../../lib/motion';

afterEach(cleanup);

function Demo({ withInput = false }: { withInput?: boolean }) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button onClick={() => setOpen(true)}>Open it</button>
            <Modal open={open} onClose={() => setOpen(false)}>
                <h3>Delete this?</h3>
                {withInput && <input aria-label="Reason" />}
                <button>Cancel</button>
                <button onClick={() => setOpen(false)}>Confirm</button>
            </Modal>
        </>
    );
}

describe('Modal', () => {
    it('is named by its heading and moves focus inside', async () => {
        const u = userEvent.setup();
        render(<Demo />);
        await u.click(screen.getByRole('button', { name: 'Open it' }));
        const dialog = await screen.findByRole('dialog', { name: 'Delete this?' });
        await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    });

    it('focuses a text field first when there is one', async () => {
        const u = userEvent.setup();
        render(<Demo withInput />);
        await u.click(screen.getByRole('button', { name: 'Open it' }));
        await waitFor(() => expect(screen.getByLabelText('Reason')).toHaveFocus());
    });

    it('keeps Tab inside, wrapping both ways', async () => {
        const u = userEvent.setup();
        render(<Demo />);
        await u.click(screen.getByRole('button', { name: 'Open it' }));
        const dialog = await screen.findByRole('dialog');
        await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus());
        await u.tab(); expect(screen.getByRole('button', { name: 'Confirm' })).toHaveFocus();
        await u.tab(); expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus(); // wrapped, did not escape to the page
        await u.tab({ shift: true }); expect(screen.getByRole('button', { name: 'Confirm' })).toHaveFocus();
        expect(dialog.contains(document.activeElement)).toBe(true);
    });

    it('gives focus back to what opened it, on Escape and on a button', async () => {
        const u = userEvent.setup();
        render(<Demo />);
        const opener = screen.getByRole('button', { name: 'Open it' });
        await u.click(opener);
        await screen.findByRole('dialog');
        await u.keyboard('{Escape}');
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(opener).toHaveFocus();

        await u.click(opener);
        await u.click(await screen.findByRole('button', { name: 'Confirm' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(opener).toHaveFocus();
    });
});
