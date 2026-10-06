import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, Pop, Modal, UnderlineTabs, AnimatedNumber, listItem, spring, tapFlat } from '../lib/motion';
import { useAppData } from '../lib/appData';
import { useDismiss } from '../lib/hooks';
import { createSession, deleteGroup, removeMember, inviteToGroup, listPendingInvites, revokeInvite, recordSettlement, addGuest, renameGuest, removeGuest, updateSettlement, deleteSettlement, listSettlementLog, listExpenseLog, PendingInvite, Session, Settlement } from '../lib/api';
import { groupLedger } from '../lib/ledger';
import { ActivityItem, describeChange, mergeActivity } from '../lib/activity';
import { computeBalances } from '../lib/balances';
import { categoryOf, CATEGORIES, everyoneEqual, myShare, totalOf } from '../lib/expenses';
import { fmt, memberTones } from '../lib/people';
import { Avatar, AvatarStack, Button, Card, Icon, inputCls } from './ui';

export type GroupTab = 'expenses' | 'balances' | 'activity' | 'members';

interface GroupDetailProps {
    groupId: string;
    initialTab?: GroupTab;
    narrow: boolean;
    onBack: () => void;
    /** `draft` is true for a record that was just created and is not saved until its author says so. */
    onOpenRecord: (id: string, kind: 'receipt' | 'expense', draft?: boolean) => void;
}

type Confirm = null | { kind: 'leave' | 'delete' | 'remove'; userId?: string; name?: string };

/** One line in the list: an expense/receipt, or a transfer between two members. */
type Entry = { type: 'record'; date: string; at: string; rec: Session } | { type: 'transfer'; date: string; at: string; p: Settlement };
const localDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const monthLabel = (iso: string) => {
    const d = new Date(iso + 'T00:00');
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return d.toLocaleDateString('en-US', sameYear ? { month: 'long' } : { month: 'long', year: 'numeric' });
};

export default function GroupDetail({ groupId, initialTab = 'expenses', narrow, onBack, onOpenRecord }: GroupDetailProps) {
    const { me, groups, sessions, settlements, refresh, loading } = useAppData();
    const group = groups.find(g => g.id === groupId);
    const [tab, setTab] = useState<GroupTab>(initialTab);
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState<string | null>(null);
    const [addOpen, setAddOpen] = useState(false);
    const [pending, setPending] = useState<PendingInvite[]>([]);
    const [email, setEmail] = useState('');
    const [personName, setPersonName] = useState('');
    const [guestOp, setGuestOp] = useState<null | { id: string; kind: 'rename'; value: string }>(null);
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
        if (tab !== 'activity') return;
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
        listPendingInvites(groupId).then(setPending).catch(err => setError(err.message));
    }, [groupId, isOwner]);

    const tones = useMemo(() => memberTones(group?.members ?? [], me), [group, me]);
    const nameOf = (id: string | null) => (group?.members.find(m => m.user_id === id)?.name ?? 'someone');
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
    }, [records, groupPaybacks, search, category, group, me]);

    const months = useMemo(() => {
        const out: { label: string; rows: Entry[] }[] = [];
        for (const e of shown) {
            const label = monthLabel(e.date);
            const bucket = out.find(m => m.label === label) ?? (out[out.push({ label, rows: [] }) - 1]);
            bucket.rows.push(e);
        }
        return out;
    }, [shown]);

    if (!group) {
        return <p className="text-center text-faint py-16 animate-pulse">{loading ? 'Loading group…' : 'This group is no longer available.'}</p>;
    }

    const memberNames = group.members.map(m => m.name);

    const addReceipt = async () => {
        setAddOpen(false);
        if (creating.current) return;
        creating.current = true;
        try {
            const id = await createSession({ groupId, name: 'Receipt', participants: memberNames, category: 'groceries', draft: true });
            await refresh();
            onOpenRecord(id, 'receipt', true);
        } catch (err: any) { creating.current = false; setError(err.message || 'Could not create the receipt'); }
    };

    const addExpense = async () => {
        setAddOpen(false);
        if (creating.current) return;
        creating.current = true;
        try {
            const id = await createSession({
                groupId, kind: 'expense', draft: true, name: 'New expense', category: 'other', amount: 0,
                splitMethod: 'exact', splitData: {}, // nobody is selected until you choose
            });
            await refresh();
            onOpenRecord(id, 'expense', true);
        } catch (err: any) { creating.current = false; setError(err.message || 'Could not create the expense'); }
    };

    // The form opens on the first suggested transfer; changing who paid / who received refills the amount when
    // that exact transfer is one of the suggestions.
    const openPayback = () => {
        setAddOpen(false);
        if (group.members.length < 2) { setError('Invite someone to this group first.'); return; }
        const t = ledger?.transfers[0];
        const other = group.members.find(m => m.user_id !== me)!;
        setPbFrom(t?.from ?? me);
        setPbTo(t?.to ?? other.user_id);
        setPbAmount(t ? String(t.amount) : '');
        setPbEditId(null);
        setPbOpen(true);
    };
    const editPayback = (p: Settlement) => {
        setPbFrom(p.from_user);
        setPbTo(p.to_user);
        setPbAmount(String(p.amount));
        setPbEditId(p.id);
        setPbOpen(true);
    };
    const changePayback = (from: string, to: string) => {
        setPbFrom(from);
        setPbTo(to);
        const t = ledger?.transfers.find(x => x.from === from && x.to === to);
        if (t) setPbAmount(String(t.amount));
    };
    const pbAmountNum = Math.round((parseFloat(pbAmount) || 0) * 100) / 100;
    const pbValid = !!pbFrom && !!pbTo && pbFrom !== pbTo && pbAmountNum > 0;
    const savePayback = async () => {
        if (!pbValid) return;
        setSettling(true);
        setError('');
        try {
            if (pbEditId) await updateSettlement(pbEditId, pbFrom, pbTo, pbAmountNum);
            else await recordSettlement(groupId, pbFrom, pbTo, pbAmountNum);
            setPbOpen(false);
            await refresh();
        } catch (err: any) {
            setError(err.message || (pbEditId ? 'Could not save that transfer' : 'Could not record that transfer'));
        } finally {
            setSettling(false);
        }
    };
    const removePayback = async (id: string) => {
        setError('');
        try { await deleteSettlement(id); await refresh(); }
        catch (err: any) { setError(err.message || 'Could not delete that transfer'); }
    };

    const handleInvite = async () => {
        const u = email.trim().toLowerCase().replace(/^@/, '');
        setError(''); setNotice('');
        if (!/^[a-z0-9_]{3,20}$/.test(u)) return setError('Enter a username: 3 to 20 letters, numbers or underscores.');
        if (group.members.some(m => !m.pending && m.username === u)) return setError('That person is already in this group.');
        try {
            await inviteToGroup(groupId, u);
            setEmail('');
            setNotice(`Invited @${u}. You can use them in expenses now; it all moves to their account when they accept.`);
            await refresh();
            setPending(await listPendingInvites(groupId));
        } catch (err: any) { setError(err.message); }
    };

    const reloadPeople = async () => { await refresh(); setPending(await listPendingInvites(groupId)); };
    const addPerson = async () => {
        const n = personName.trim();
        if (!n) return;
        setError(''); setNotice('');
        try { await addGuest(groupId, n); setPersonName(''); await reloadPeople(); }
        catch (err: any) { setError(err.message || 'Could not add that person'); }
    };
    const runGuestOp = async () => {
        if (!guestOp || !guestOp.value.trim()) return;
        setError(''); setNotice('');
        try {
            await renameGuest(guestOp.id, guestOp.value);
            setGuestOp(null);
            await reloadPeople();
        } catch (err: any) { setError(err.message || 'That did not work'); }
    };
    const dropGuest = async (id: string) => {
        setError('');
        try { await removeGuest(id); await reloadPeople(); }
        catch (err: any) { setError(err.message || 'Could not remove that person'); }
    };

    const handleConfirm = async () => {
        if (!confirm) return;
        const c = confirm;
        setConfirm(null);
        try {
            if (c.kind === 'delete') { await deleteGroup(groupId); await refresh(); return onBack(); }
            if (c.kind === 'leave') { await removeMember(groupId, me); await refresh(); return onBack(); }
            await removeMember(groupId, c.userId!);
            await refresh();
        } catch (err: any) { setError(err.message || 'Action failed'); }
    };

    const settle = async (from: string, to: string, amount: number) => {
        if (settling) return;
        setSettling(true);
        setError('');
        try {
            await recordSettlement(groupId, from, to, amount);
            await refresh();
        } catch (err: any) {
            setError(err.message || 'Could not record that payment');
        } finally {
            setSettling(false);
        }
    };
    const who = (id: string) => (group.members.find(m => m.user_id === id)?.name ?? 'Someone');

    const confirmText = {
        delete: { title: 'Delete group?', body: `This permanently deletes "${group.name}" and all ${records.length} of its expenses for every member.`, action: 'Delete' },
        leave: { title: 'Leave group?', body: `You'll lose access to "${group.name}" and its expenses unless someone invites you again.`, action: 'Leave' },
        remove: { title: 'Remove member?', body: `Remove ${shownConfirm?.name} from "${group.name}"? They lose access to its expenses.`, action: 'Remove' },
    };

    const balanceLine = Math.abs(net) < 0.005 ? "Everyone's square" : net > 0 ? `You're owed ${fmt(net)} here` : `You owe ${fmt(net)} here`;

    return (
        <div className="max-w-[820px] mx-auto flex flex-col gap-7">
            <Modal open={!!confirm} onClose={() => setConfirm(null)}>
                {shownConfirm && (
                    <>
                        <h3 className="m-0 mb-2 text-xl font-semibold text-ink">{confirmText[shownConfirm.kind].title}</h3>
                        <p className="m-0 mb-6 text-muted leading-relaxed">{confirmText[shownConfirm.kind].body}</p>
                        <div className="flex gap-3">
                            <Button variant="secondary" wide height={42} onClick={() => setConfirm(null)}>Cancel</Button>
                            <Button wide height={42} className="!bg-coral-strong hover:opacity-90" onClick={handleConfirm}>{confirmText[shownConfirm.kind].action}</Button>
                        </div>
                    </>
                )}
            </Modal>

            <Modal open={pbOpen} onClose={() => setPbOpen(false)}>
                <h3 className="m-0 mb-1 text-xl font-semibold text-ink">{pbEditId ? 'Edit transfer' : 'Record a transfer'}</h3>
                <p className="m-0 mb-4 text-sm text-muted">Evens out what two members of {group.name} owe each other. It doesn't move money.{pbEditId && ' Changes are logged under Activity.'}</p>
                <div className="flex flex-col gap-3">
                    <label className="flex flex-col gap-1.5 text-[13px] font-medium text-body">Who paid
                        <select value={pbFrom} onChange={e => changePayback(e.target.value, pbTo)} className="h-[42px] px-3 border border-line rounded-[10px] bg-white text-[15px] text-ink">
                            {group.members.map(m => <option key={m.user_id} value={m.user_id}>{who(m.user_id)}</option>)}
                        </select>
                    </label>
                    <label className="flex flex-col gap-1.5 text-[13px] font-medium text-body">Who received
                        <select value={pbTo} onChange={e => changePayback(pbFrom, e.target.value)} className="h-[42px] px-3 border border-line rounded-[10px] bg-white text-[15px] text-ink">
                            {group.members.map(m => <option key={m.user_id} value={m.user_id}>{who(m.user_id)}</option>)}
                        </select>
                    </label>
                    <label className="flex flex-col gap-1.5 text-[13px] font-medium text-body">Amount
                        <span className="flex items-center gap-1 h-[42px] px-3 border border-line rounded-[10px] bg-white focus-within:border-ink">
                            <span className="font-mono text-faint">$</span>
                            <input aria-label="Transfer amount" inputMode="decimal" value={pbAmount} onChange={e => setPbAmount(e.target.value)} placeholder="0.00" className="flex-1 min-w-0 border-0 bg-transparent font-mono text-[15px]" />
                        </span>
                    </label>
                    {pbFrom && pbFrom === pbTo && <span role="alert" className="text-[13px] text-coral-strong">Pick two different people.</span>}
                </div>
                <div className="flex gap-3 mt-5">
                    <Button variant="secondary" wide height={42} onClick={() => setPbOpen(false)}>Cancel</Button>
                    <Button wide height={42} disabled={settling || !pbValid} onClick={savePayback}>{pbEditId ? 'Save changes' : 'Save transfer'}</Button>
                </div>
            </Modal>

            <div className="flex flex-wrap items-end justify-between gap-5">
                <div className="flex flex-col gap-3 min-w-0">
                    {!narrow && (
                        <motion.button {...tapFlat} onClick={onBack} className="self-start flex items-center gap-1 text-[13px] text-muted hover:text-ink"><Icon name="arrow_back" size={16} />Home</motion.button>
                    )}
                    <h1 className="m-0 text-[30px] font-semibold tracking-title truncate">{group.name}</h1>
                    <div className="flex items-center gap-3">
                        <AvatarStack size={28} people={group.members.map(m => ({ name: m.name, tone: tones[m.user_id] }))} />
                        <span className="text-sm text-body">{balanceLine}</span>
                    </div>
                    <div className="text-sm text-muted">
                        Total cost <span className="font-semibold text-ink">{fmt(totalCost)}</span> across {records.filter(r => !r.draft).length} {records.filter(r => !r.draft).length === 1 ? 'expense' : 'expenses'}
                    </div>
                </div>
                <div className="relative" ref={addRef}>
                    <Button height={42} className="px-[18px]" aria-expanded={addOpen} aria-haspopup="menu" onClick={() => setAddOpen(o => !o)}>
                        <Icon name="add" size={20} />Add expense
                    </Button>
                    <AnimatePresence>
                        {addOpen && (
                            <motion.div
                                role="menu"
                                className="absolute right-0 top-12 z-10 w-[300px] max-w-[calc(100vw-32px)] bg-white border border-edge rounded-[14px] shadow-popover p-1.5 flex flex-col origin-top-right"
                                initial={{ opacity: 0.8, scale: 0.94, y: -6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: -4 }} transition={spring}
                            >
                                {[
                                    { icon: 'payments', title: 'Split a total', desc: 'One price: rent, a bill, a trip. Split by amount or shares', go: addExpense },
                                    { icon: 'receipt_long', title: 'Split a receipt', desc: 'Itemized: tap who had what, or import it from JSON', go: addReceipt },
                                    { icon: 'swap_horiz', title: 'Record a transfer', desc: 'Someone paid someone back, or you did', go: openPayback },
                                ].map(o => (
                                    <motion.button key={o.title} role="menuitem" {...tapFlat} onClick={o.go} className="flex gap-3 p-3 rounded-[10px] bg-white text-left text-ink hover:bg-wash transition-colors">
                                        <Icon name={o.icon} size={22} />
                                        <span className="flex flex-col gap-0.5"><span className="text-sm font-semibold">{o.title}</span><span className="text-[13px] text-muted leading-[1.4]">{o.desc}</span></span>
                                    </motion.button>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            <UnderlineTabs id="group" value={tab} onChange={setTab} tabs={[
                { value: 'expenses', label: `Expenses · ${records.length}` },
                { value: 'balances', label: 'Balances' },
                { value: 'activity', label: 'Activity' },
                { value: 'members', label: `Members · ${group.members.length}` },
            ]} />

            <Pop show={!!error} className="px-3 py-2.5 rounded-[10px] bg-coral-tint text-coral-on text-[13px]">{error}</Pop>
            <Pop show={!!notice} className="px-3 py-2.5 rounded-[10px] bg-green-tint text-green-on text-[13px]">{notice}</Pop>

            <motion.div key={tab} initial={{ y: 10 }} animate={{ y: 0 }} transition={{ duration: 0.18 }}>
                {tab === 'expenses' && (
                    <div className="flex flex-col gap-6">
                        <div className="flex items-center gap-2 h-[42px] px-3.5 bg-white border border-edge rounded-[10px]">
                            <Icon name="search" size={20} className="text-faint" />
                            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search expenses or items" aria-label="Search expenses" className="flex-1 min-w-0 border-0 bg-transparent text-sm" />
                        </div>

                        {categoriesPresent.length > 1 && (
                            <div className="flex flex-wrap gap-2 -mt-2" role="group" aria-label="Filter by category">
                                {[{ id: null as string | null, label: 'All', icon: '' }, ...categoriesPresent].map(c => {
                                    const on = category === c.id;
                                    return (
                                        <motion.button key={c.label} {...tapFlat} onClick={() => setCategory(on && c.id ? null : c.id)} aria-pressed={on}
                                            className={`h-8 px-3 rounded-full text-[13px] font-semibold border transition-colors flex items-center gap-1.5 ${on ? 'bg-ink text-white border-ink' : 'bg-white text-body border-line hover:bg-surface'}`}>
                                            {c.icon && <Icon name={c.icon} size={16} />}{c.label}
                                        </motion.button>
                                    );
                                })}
                            </div>
                        )}

                        {months.map(m => (
                            <div key={m.label} className="flex flex-col gap-2">
                                <span className="text-[13px] font-medium text-faint">{m.label}</span>
                                <Card className="overflow-hidden">
                                    {m.rows.map((e, i) => {
                                        if (e.type === 'transfer') {
                                            const p = e.p;
                                            const d = new Date(e.date + 'T00:00');
                                            return (
                                                <motion.div key={`pb-${p.id}`} {...listItem(i)} className={`flex items-center gap-4 px-[18px] py-3.5 bg-white ${i ? 'border-t border-rule' : ''}`}>
                                                    <span className="w-[42px] shrink-0 flex flex-col items-center leading-[1.1]">
                                                        <span className="text-[11px] font-medium text-faint">{d.toLocaleDateString('en-US', { month: 'short' })}</span>
                                                        <span className="text-lg font-semibold">{d.getDate()}</span>
                                                    </span>
                                                    <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                                                        <span className="text-[15px] font-semibold truncate flex items-center gap-1.5">
                                                            <Icon name="swap_horiz" size={16} className="text-green" />{nameOf(p.from_user)} paid {nameOf(p.to_user)}
                                                        </span>
                                                        <span className="text-[13px] text-faint">Transfer</span>
                                                    </span>
                                                    <span className="shrink-0 flex flex-col items-end gap-0.5">
                                                        <span className="text-[15px] font-semibold text-green">{fmt(p.amount)}</span>
                                                        <span className="flex gap-2.5">
                                                            <button type="button" onClick={() => editPayback(p)} className="text-xs font-semibold text-ink underline underline-offset-2">Edit</button>
                                                            <button type="button" onClick={() => removePayback(p.id)} className="text-xs font-semibold text-ink underline underline-offset-2">Delete</button>
                                                        </span>
                                                    </span>
                                                </motion.div>
                                            );
                                        }
                                        const r = e.rec;
                                        const d = new Date(r.session_date + 'T00:00');
                                        const total = totalOf(r);
                                        const share = myShare(r, meMember);
                                        const meta = r.kind === 'expense' ? categoryOf(r.category).label : `${r.items.length} ${r.items.length === 1 ? 'item' : 'items'}`;
                                        return (
                                            <motion.div key={r.id} {...listItem(i)}>
                                                <motion.button
                                                    {...tapFlat}
                                                    onClick={() => onOpenRecord(r.id, r.kind)}
                                                    className={`w-full flex items-center gap-4 px-[18px] py-3.5 bg-white text-left hover:bg-wash transition-colors ${i ? 'border-t border-rule' : ''}`}
                                                >
                                                    <span className="w-[42px] shrink-0 flex flex-col items-center leading-[1.1]">
                                                        <span className="text-[11px] font-medium text-faint">{d.toLocaleDateString('en-US', { month: 'short' })}</span>
                                                        <span className="text-lg font-semibold">{d.getDate()}</span>
                                                    </span>
                                                    <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                                                        <span className="text-[15px] font-semibold truncate flex items-center gap-1.5">
                                                            {r.kind === 'expense' && <Icon name={categoryOf(r.category).icon} size={16} className="text-faint" />}{r.name}
                                                        </span>
                                                        <span className="text-[13px] text-faint">{meta} · paid by {nameOf(r.paid_by)}</span>
                                                    </span>
                                                    <span className="shrink-0 flex flex-col items-end gap-0.5">
                                                        <span className="text-[15px] font-semibold">{fmt(total)}</span>
                                                        <span className="text-xs text-faint">your share {fmt(share)}</span>
                                                    </span>
                                                </motion.button>
                                            </motion.div>
                                        );
                                    })}
                                </Card>
                            </div>
                        ))}

                        {months.length === 0 && (
                            <p className="m-0 p-8 text-center text-sm text-faint border border-dashed border-line rounded-[14px]">
                                {records.length ? 'Nothing matches that search.' : 'No expenses yet. Add one and everyone in the group can see it.'}
                            </p>
                        )}
                    </div>
                )}

                {tab === 'balances' && ledger && (
                    <div className="flex flex-col gap-5">
                        <Card className="overflow-hidden">
                            <div className="px-[18px] pt-4 pb-1 text-[15px] font-semibold">Where everyone stands</div>
                            {ledger.members.map((m, i) => {
                                const member = group.members.find(x => x.user_id === m.userId)!;
                                const square = Math.abs(m.net) < 0.005;
                                return (
                                    <motion.div key={m.userId} {...listItem(i)} className={`flex flex-col gap-1.5 px-[18px] py-3.5 ${i ? 'border-t border-rule' : ''}`}>
                                        <div className="flex items-center gap-3">
                                            <Avatar name={member.name} tone={tones[m.userId]} size={36} />
                                            <span className="flex-1 min-w-0 text-[15px] font-semibold truncate">{who(m.userId)}</span>
                                            <span className="shrink-0 flex flex-col items-end gap-0.5">
                                                {square ? <span className="text-[15px] font-semibold text-faint">Settled</span> : <AnimatedNumber value={Math.abs(m.net)} prefix={m.net < 0 ? '-$' : '$'} className={`text-[15px] font-semibold ${m.net > 0 ? 'text-green' : 'text-coral'}`} />}
                                                <span className="text-xs text-faint">{square ? 'all square' : m.net > 0 ? 'up' : 'down'}</span>
                                            </span>
                                        </div>
                                        <div className="h-[3px] ml-12 rounded-sm bg-surface">
                                            <motion.div className={`h-full rounded-sm opacity-60 ${m.net > 0 ? 'bg-green' : 'bg-coral'}`} initial={false} animate={{ width: `${(Math.abs(m.net) / maxNet) * 100}%` }} transition={{ duration: 0.25 }} />
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </Card>

                        <div className="flex flex-col gap-2">
                            <span className="text-[15px] font-semibold">Suggested transfers</span>
                            {ledger.transfers.length === 0 ? (
                                <p className="m-0 px-4 py-3.5 rounded-[14px] bg-green-tint text-green-on text-sm font-medium">Everyone's square.</p>
                            ) : (
                                <Card className="overflow-hidden">
                                    <AnimatePresence initial={false}>
                                        {ledger.transfers.map((t, i) => (
                                            <motion.div key={`${t.from}-${t.to}`} {...listItem(i)} className={`flex flex-wrap items-center gap-3 px-[18px] py-3 ${i ? 'border-t border-rule' : ''}`}>
                                                <span className="flex-1 min-w-[160px] text-sm">
                                                    <span className="font-semibold">{who(t.from)}</span> {t.from === me ? 'pay' : 'pays'} <span className="font-semibold">{who(t.to)}</span>
                                                </span>
                                                <span className="font-mono text-sm font-medium">{fmt(t.amount)}</span>
                                                <Button variant="secondary" height={32} className="rounded-lg px-3 text-[13px]" disabled={settling} onClick={() => settle(t.from, t.to, t.amount)}>Record transfer</Button>
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                </Card>
                            )}
                            <span className="text-xs leading-normal text-faint">The fewest payments that settle everyone. Recording one doesn't move money; it just updates the balances.</span>
                        </div>
                    </div>
                )}

                {tab === 'activity' && (
                    <div className="flex flex-col gap-2">
                        <span className="text-[13px] text-muted">Every expense, receipt and transfer that was added, changed or deleted, by whom, and when.</span>
                        {log === null ? <p className="text-faint animate-pulse">Loading…</p> : log.length === 0 ? (
                            <Card className="p-5 text-sm text-muted">No activity yet.</Card>
                        ) : (
                            <Card className="overflow-hidden">
                                {log.map((a, i) => {
                                    const nm = (id: string | null) => (id ? who(id) : 'Someone');
                                    const when = new Date(a.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
                                    let line: React.ReactNode;
                                    let details: string[] = [];
                                    if (a.type === 'transfer') {
                                        const l = a.entry;
                                        const move = (f: string, t: string, amt: number) => `${nm(f)} → ${nm(t)} ${fmt(amt)}`;
                                        line = <><span className="font-semibold">{nm(l.actor)}</span> {l.action === 'created' ? 'recorded' : l.action} a transfer</>;
                                        details = [l.action === 'edited' && l.prev_amount != null ? `${move(l.prev_from_user!, l.prev_to_user!, l.prev_amount)} became ${move(l.from_user, l.to_user, l.amount)}` : move(l.from_user, l.to_user, l.amount)];
                                    } else {
                                        const l = a.entry;
                                        const what = l.kind === 'receipt' ? 'receipt' : 'expense';
                                        line = <><span className="font-semibold">{nm(l.actor)}</span> {l.action} {what === 'receipt' ? 'a receipt' : 'an expense'}: <span className="font-semibold">{l.name}</span> · {fmt(l.total)}</>;
                                        details = l.action === 'edited' ? l.changes.map(describeChange) : [];
                                    }
                                    return (
                                        <div key={a.id} className={`px-[18px] py-3 flex flex-col gap-0.5 ${i ? 'border-t border-rule' : ''}`}>
                                            <span className="text-[14px]">{line}</span>
                                            {details.map((d, j) => <span key={j} className="text-[13px] text-muted">{d}</span>)}
                                            <span className="text-xs text-faint">{when}</span>
                                        </div>
                                    );
                                })}
                            </Card>
                        )}
                    </div>
                )}

                {tab === 'members' && (
                    <div className="flex flex-col gap-5">
                        {group.personal && (
                            <div className="px-3.5 py-3 rounded-[10px] bg-surface text-sm text-body">This is your Personal section. Only you can see it, and the people in it are just names, so they never show up under People. Use it to keep track of what you paid for others.</div>
                        )}
                        {isOwner && !group.personal && (
                            <Card className="p-[18px] flex flex-col gap-2.5">
                                <span className="text-[15px] font-semibold">Invite someone</span>
                                <div className="flex gap-2">
                                    <span className="flex-1 min-w-0 flex items-center gap-1 h-[42px] px-3 border border-line rounded-[10px] bg-white focus-within:border-ink">
                                        <span className="text-faint">@</span>
                                        <input value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleInvite()} placeholder="username" aria-label="Invite by username" autoCapitalize="none" className="flex-1 min-w-0 border-0 bg-transparent text-sm" />
                                    </span>
                                    <Button height={42} onClick={handleInvite} disabled={!email.trim()}>Send invite</Button>
                                </div>
                                <span className="text-[13px] leading-normal text-faint">While an invite is pending you can already add them to expenses. They'll see the invite when they sign in, and everything moves to their account when they accept. They can find their username under Account.</span>
                                <AnimatePresence initial={false}>
                                    {pending.map(p => (
                                        <motion.div key={p.id} layout initial={{ opacity: 0.8, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="flex items-center gap-2.5 px-3 py-2.5 bg-surface rounded-[10px]">
                                            <Icon name="schedule" size={18} className="text-faint" />
                                            <span className="flex-1 text-sm truncate">{p.name}</span>
                                            <motion.button {...tapFlat} onClick={async () => { setError(''); try { await revokeInvite(p.id); await refresh(); setPending(await listPendingInvites(groupId)); } catch (err: any) { setError(err.message || 'Could not cancel that invite'); } }} className="text-[13px] font-semibold text-coral">Revoke</motion.button>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </Card>
                        )}
                        {isOwner && group.personal && (
                            <Card className="p-[18px] flex flex-col gap-2.5">
                                <span className="text-[15px] font-semibold">Add someone by name</span>
                                <div className="flex gap-2">
                                    <input value={personName} onChange={e => setPersonName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addPerson()} placeholder="Name" aria-label="Person's name" maxLength={60} className={`${inputCls} flex-1 min-w-0 text-sm`} />
                                    <Button height={42} variant="secondary" onClick={addPerson} disabled={!personName.trim()}>Add</Button>
                                </div>
                                <span className="text-[13px] leading-normal text-faint">No account needed and nobody is notified. Use them in expenses like anyone else.</span>
                            </Card>
                        )}

                        <Card className="overflow-hidden">
                            {group.members.map((m, i) => (
                                <motion.div key={m.user_id} {...listItem(i)} className={`flex flex-wrap items-center gap-3.5 px-[18px] py-3.5 ${i ? 'border-t border-rule' : ''}`}>
                                    <Avatar name={m.name} tone={tones[m.user_id]} size={36} />
                                    <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                                        <span className="text-[15px] font-semibold truncate">{m.name}</span>
                                        <span className="text-[13px] text-faint truncate">{m.pending ? (group.personal ? 'Just a name' : 'Invite pending') : m.username ? `@${m.username}` : m.email}</span>
                                    </span>
                                    {m.role === 'owner' && <span className="text-xs text-muted">Owner</span>}
                                    {m.pending && <span className="text-xs font-medium text-muted px-2 py-0.5 rounded-full bg-surface">{group.personal ? 'Name only' : 'Invited'}</span>}
                                    {isOwner && m.pending && (
                                        <span className="flex items-center gap-2.5 text-xs font-semibold text-body">
                                            {group.personal && <button type="button" onClick={() => setGuestOp({ id: m.user_id, kind: 'rename', value: m.name })} className="underline underline-offset-2">Rename</button>}
                                                                            <motion.button {...tapFlat} aria-label={`Remove ${m.name}`} onClick={() => dropGuest(m.user_id)} className="w-8 h-8 grid place-items-center rounded-full text-faint hover:bg-coral-tint hover:text-coral"><Icon name="close" size={18} /></motion.button>
                                        </span>
                                    )}
                                    {isOwner && m.role !== 'owner' && !m.pending && (
                                        <motion.button {...tapFlat} aria-label={`Remove ${m.name}`} onClick={() => setConfirm({ kind: 'remove', userId: m.user_id, name: m.name })} className="w-8 h-8 grid place-items-center rounded-full text-faint hover:bg-coral-tint hover:text-coral">
                                            <Icon name="close" size={18} />
                                        </motion.button>
                                    )}
                                    {guestOp?.id === m.user_id && (
                                        <div className="basis-full flex flex-wrap items-center gap-2 pt-2">
                                            <input autoFocus aria-label={`New name for ${m.name}`} value={guestOp.value} onChange={e => setGuestOp({ ...guestOp, value: e.target.value })} onKeyDown={e => e.key === 'Enter' && runGuestOp()} placeholder="New name" maxLength={60} className="h-9 px-2.5 border border-line rounded-lg bg-white text-sm flex-1 min-w-[160px]" />
                                            <Button height={36} className="px-3.5" disabled={!guestOp.value.trim()} onClick={runGuestOp}>Rename</Button>
                                            <Button variant="secondary" height={36} className="px-3.5" onClick={() => setGuestOp(null)}>Cancel</Button>
                                        </div>
                                    )}
                                </motion.div>
                            ))}
                        </Card>

                        {group.personal ? null : isOwner ? (
                            <motion.button {...tapFlat} onClick={() => setConfirm({ kind: 'delete' })} className="self-start text-sm font-semibold text-coral">Delete group</motion.button>
                        ) : (
                            <motion.button {...tapFlat} onClick={() => setConfirm({ kind: 'leave' })} className="self-start text-sm font-semibold text-coral">Leave group</motion.button>
                        )}
                    </div>
                )}
            </motion.div>
        </div>
    );
}
