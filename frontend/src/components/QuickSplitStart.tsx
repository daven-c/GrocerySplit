import { useState } from 'react';
import { Modal } from '../lib/motion';
import { Button } from './ui';
import { startQuickSplit } from '../lib/quickSplit';

/** Starting a quick split creates a shareable link, so ask first instead of creating one per click. */
export function useQuickSplitStart(onError?: (message: string) => void) {
    const [open, setOpen] = useState(false);
    const [starting, setStarting] = useState(false);

    const go = async () => {
        setStarting(true);
        try { await startQuickSplit(); }
        catch (err: any) {
            setStarting(false);
            setOpen(false);
            (onError ?? ((m: string) => console.error('Could not start a quick split', m)))(err?.message || 'Could not start a quick split');
        }
    };

    const dialog = (
        <Modal open={open} onClose={() => !starting && setOpen(false)}>
            <h3 className="m-0 mb-2 text-xl font-black text-ink">Start a quick split?</h3>
            <p className="m-0 mb-6 text-muted font-semibold leading-relaxed">This makes a link anyone can open and edit, no account needed. It disappears after 30 days of no use.</p>
            <div className="flex gap-3">
                <Button variant="secondary" wide height={44} disabled={starting} onClick={() => setOpen(false)}>Cancel</Button>
                <Button wide height={44} disabled={starting} onClick={go}>{starting ? 'Starting...' : 'Start quick split'}</Button>
            </div>
        </Modal>
    );
    return { ask: () => setOpen(true), starting, dialog };
}
