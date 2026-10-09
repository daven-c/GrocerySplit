import type { ReactNode } from 'react';
import { Modal } from '../lib/motion';
import { Button } from './ui';

/** One "Are you sure?" dialog for anything that can't be undone: a title, what will happen, and Cancel / the action. */
export default function ConfirmDialog({ open, title, body, confirmLabel, onConfirm, onClose, busy = false }: {
    open: boolean;
    title: string;
    body: ReactNode;
    confirmLabel: string;
    onConfirm: () => void;
    onClose: () => void;
    busy?: boolean;
}) {
    return (
        <Modal open={open} onClose={() => !busy && onClose()}>
            <h2 className="m-0 mb-2 text-xl font-black text-ink">{title}</h2>
            <p className="m-0 mb-6 text-muted font-semibold leading-relaxed">{body}</p>
            <div className="flex gap-3">
                <Button variant="secondary" wide height={44} disabled={busy} onClick={onClose}>Cancel</Button>
                <Button wide height={44} className="!bg-coral-strong hover:opacity-90" disabled={busy} onClick={onConfirm}>{confirmLabel}</Button>
            </div>
        </Modal>
    );
}
