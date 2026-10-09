import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppData } from '../../lib/appData';
import { useDismiss } from '../../lib/hooks';
import { listPendingInvites, listSettlementLog, listExpenseLog, PendingInvite } from '../../lib/api';
import { groupLedger } from '../../lib/ledger';
import { ActivityItem, mergeActivity } from '../../lib/activity';
import { isEnabled } from '../../lib/flags';
import { computeBalances } from '../../lib/balances';
import { categoryOf, CATEGORIES, totalOf } from '../../lib/expenses';
import { labelMap, memberTones } from '../../lib/people';
import { messageOf } from '../../lib/errors';
import { GroupTab, GroupDetailProps, Confirm, Entry, localDate, monthLabel } from './types';

export function useGroupState({ groupId, initialTab = 'expenses', onBack, onOpenRecord }: GroupDetailProps) {
    const { me, groups, sessions, settlements, refresh, loading } = useAppData();
    const group = groups.find(g => g.id === groupId);
    const [tab, setTab] = useState<GroupTab>(initialTab);
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState<string | null>(null);
    const [addOpen, setAddOpen] = useState(false);
    const [pending, setPending] = useState<PendingInvite[]>([]);
    const [email, setEmail] = useState('');
    const [personName, setPersonName] = useState('');
    const [personUser, setPersonUser] = useState('');
    const [side, setSide] = useState<'balances' | 'people'>(initialTab === 'members' ? 'people' : 'balances'); // Personal: balances by default, people are used less often
    const [guestOp, setGuestOp] = useState<null | { id: string; kind: 'rename' | 'link'; value: string }>(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [confirm, setConfirm] = useState<Confirm>(null);
    const [settling, setSettling] = useState(false);
    const [pbOpen, setPbOpen] = useState(false);
    const [pbEditId, setPbEditId] = useState<string | null>(null);
    const [log, setLog] = useState<ActivityItem[] | null>(null);
    const [pbFrom, setPbFrom] = useState('');
    const [pbTo, setPbTo] = useState('');
    const [pbAmount, setPbAmount] = useState('');
    const creating = useRef(false);
    const addRef = useRef<HTMLDivElement>(null);

    // Keep the last dialog's content around while its exit animation plays.
    const lastConfirm = useRef(confirm);
    if (confirm) lastConfirm.current = confirm;
    const shownConfirm = confirm ?? lastConfirm.current;

    const closeAdd = useCallback(() => setAddOpen(false), []);
    useDismiss(addRef, addOpen, closeAdd);

    const isOwner = !!group && group.owner_id === me;
    // The transfer change log: reloaded whenever the transfers change or the tab is opened.
    useEffect(() => {
        if (tab !== 'activity' || !isEnabled('activity')) return;
        let cancelled = false;
        Promise.all([listExpenseLog(groupId), listSettlementLog(groupId)])
            .then(([e, t]) => !cancelled && setLog(mergeActivity(e, t)))
            .catch(() => !cancelled && setLog([]));
        return () => { cancelled = true; };
    }, [tab, groupId, settlements, sessions]);


    const records = useMemo(
        () => sessions.filter(s => s.group_id === groupId).sort((a, b) => b.session_date.localeCompare(a.session_date) || b.updated_at.localeCompare(a.updated_at)),
        [sessions, groupId]
    );

    useEffect(() => {
        if (!isOwner) { setPending([]); return; }
        listPendingInvites(groupId).then(setPending).catch(err => setError(messageOf(err, 'That did not work')));
    }, [groupId, isOwner]);

    const tones = useMemo(() => memberTones(group?.members ?? [], me), [group, me]);
    const labels = useMemo(() => labelMap(group?.members ?? []), [group]);
    const nameOf = (id: string | null) => (id ? labels[id] : undefined) ?? 'someone';
    const totalCost = useMemo(() => records.filter(r => !r.draft).reduce((a, r) => a + totalOf(r), 0), [records]);
    const net = useMemo(() => computeBalances(me, groups, sessions, settlements).byGroup[groupId] ?? 0, [me, groups, sessions, settlements, groupId]);
    const meMember = group?.members.find(m => m.user_id === me);

    const ledger = useMemo(
        () => (group ? groupLedger(group, records, settlements.filter(p => p.group_id === groupId)) : null),
        [group, records, settlements, groupId]
    );
    const maxNet = Math.max(0.01, ...(ledger?.members.map(m => Math.abs(m.net)) ?? []));

    const categoriesPresent = useMemo(() => CATEGORIES.filter(c => records.some(r => r.category === c.id)), [records]);

    const groupPaybacks = useMemo(() => settlements.filter(p => p.group_id === groupId), [settlements, groupId]);

    const shown = useMemo(() => {
        const q = search.trim().toLowerCase();
        const nm = (id: string) => (group?.members.find(m => m.user_id === id)?.name.toLowerCase() ?? '');
        const entries: Entry[] = [
            ...records
                .filter(r => {
                    if (category && r.category !== category) return false;
                    if (!q) return true;
                    return r.name.toLowerCase().includes(q) || categoryOf(r.category).label.toLowerCase().includes(q) || r.items.some(i => i.name.toLowerCase().includes(q));
                })
                .map(rec => ({ type: 'record' as const, date: rec.session_date, at: rec.updated_at, rec })),
            ...(category ? [] : groupPaybacks)
                .filter(p => !q || 'transfer'.includes(q) || nm(p.from_user).includes(q) || nm(p.to_user).includes(q))
                .map(p => ({ type: 'transfer' as const, date: localDate(p.created_at), at: p.created_at, p })),
        ];
        // Newest first: by date, and within a day by when it was added or last saved.
        return entries.sort((a, b) => b.date.localeCompare(a.date) || Date.parse(b.at) - Date.parse(a.at));
    }, [records, groupPaybacks, search, category, group]);

    const months = useMemo(() => {
        const out: { label: string; rows: Entry[] }[] = [];
        for (const e of shown) {
            const label = monthLabel(e.date);
            const bucket = out.find(m => m.label === label) ?? (out[out.push({ label, rows: [] }) - 1]);
            bucket.rows.push(e);
        }
        return out;
    }, [shown]);


    return { me, groups, sessions, settlements, refresh, loading, group, tab, setTab, search, setSearch, category, setCategory, addOpen, setAddOpen, pending, setPending, email, setEmail, personName, setPersonName, personUser, setPersonUser, side, setSide, guestOp, setGuestOp, error, setError, notice, setNotice, confirm, setConfirm, settling, setSettling, pbOpen, setPbOpen, pbEditId, setPbEditId, log, setLog, pbFrom, setPbFrom, pbTo, setPbTo, pbAmount, setPbAmount, creating, addRef, lastConfirm, shownConfirm, closeAdd, isOwner, records, tones, labels, nameOf, totalCost, net, meMember, ledger, maxNet, categoriesPresent, groupPaybacks, shown, months, groupId, initialTab, onBack, onOpenRecord };
}

export type GroupState = ReturnType<typeof useGroupState>;
