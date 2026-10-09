import { Session, Settlement } from '../../lib/api';

export type GroupTab = 'expenses' | 'balances' | 'activity' | 'members';

export interface GroupDetailProps {
    groupId: string;
    initialTab?: GroupTab;
    narrow: boolean;
    onBack: () => void;
    /** `draft` is true for a record that was just created and is not saved until its author says so. */
    onOpenRecord: (id: string, kind: 'receipt' | 'expense', draft?: boolean) => void;
}

export type Confirm = null | { kind: 'leave' | 'delete' | 'remove'; userId?: string; name?: string };

/** One line in the list: an expense/receipt, or a transfer between two members. */
export type Entry = { type: 'record'; date: string; at: string; rec: Session } | { type: 'transfer'; date: string; at: string; p: Settlement };
export const localDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const monthLabel = (iso: string) => {
    const d = new Date(iso + 'T00:00');
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return d.toLocaleDateString('en-US', sameYear ? { month: 'long' } : { month: 'long', year: 'numeric' });
};

